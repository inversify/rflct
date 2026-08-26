import { parseSync } from "oxc-parser";
import { qualifiedName } from "./package.mjs";
import {
  extractReflectMarker,
  serializeMetadataNode,
  serializeTypeNode,
} from "./serialize.mjs";

const MARKER_NAME = "Reflect";
const RESOLVE_NAME = "resolve";
const PACKAGE_NAME = "rflct";

/**
 * Transforms a TypeScript source file, injecting reflect metadata.
 *
 * @param {string} source - the original source text
 * @param {string} fileName - absolute path to the file (for qualified names)
 * @param {{ checkerInfo?: Map<string, "class"|"interface"|"type"> }} [options]
 * @returns {{ code: string, transformed: boolean }}
 */
export function transform(source, fileName, options) {
  const result = parseSync(fileName, source);
  if (result.errors.length > 0) {
    return { code: source, transformed: false };
  }

  const body = result.program.body;

  // Collect imports from the marker package.
  const markerImports = new Set();
  const importedNames = new Map(); // local name → { source, imported }
  for (const node of body) {
    if (node.type !== "ImportDeclaration") continue;
    const src = node.source.value;
    if (src === PACKAGE_NAME || src.startsWith(PACKAGE_NAME + "/")) {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === "ImportSpecifier") {
          markerImports.add(spec.local.name);
        }
      }
    }
    // Track all named imports for cross-file type-only detection.
    if (node.importKind === "type") {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === "ImportSpecifier") {
          importedNames.set(spec.local.name, { source: src, typeOnly: true });
        }
      }
    } else {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === "ImportSpecifier") {
          importedNames.set(spec.local.name, {
            source: src,
            typeOnly: spec.importKind === "type",
          });
        }
      }
    }
  }

  // If the file doesn't import from our package at all, skip it.
  if (!markerImports.has(MARKER_NAME) && !markerImports.has(RESOLVE_NAME)) {
    return { code: source, transformed: false };
  }

  // Collect top-level declarations.
  const declarations = new Map(); // name → { kind, exported, end }
  for (const node of body) {
    const info = extractDecl(node);
    if (info) declarations.set(info.name, info);
  }

  // If checker info is provided, override the kind for known symbols.
  if (options?.checkerInfo) {
    for (const [name, kind] of options.checkerInfo) {
      if (declarations.has(name)) {
        declarations.get(name).kind = kind;
      } else {
        declarations.set(name, { kind, name, exported: false, end: -1 });
      }
    }
  }

  // Collect class methods/constructors with Reflect<T> params.
  const reflections = [];
  // Collect resolve<T>() calls.
  const resolveCalls = [];
  // Type-only declarations that need symbol bindings.
  const neededSymbols = new Set();

  for (const node of body) {
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      collectClassReflections(node, source, declarations, reflections, neededSymbols);
    }
    // Walk the whole body for resolve() calls.
    walkForResolveCalls(node, declarations, resolveCalls, neededSymbols);
  }

  if (reflections.length === 0 && resolveCalls.length === 0) {
    return { code: source, transformed: false };
  }

  // Build edits.
  const edits = [];

  // Remove the marker import (or just the specific specifiers).
  for (const node of body) {
    if (node.type !== "ImportDeclaration") continue;
    const src = node.source.value;
    if (src === PACKAGE_NAME || src.startsWith(PACKAGE_NAME + "/")) {
      // Remove the entire import statement.
      edits.push({ start: node.start, end: node.end, replacement: "" });
    }
  }

  // Symbol declarations for type-only references.
  const symbolDecls = [];
  for (const name of neededSymbols) {
    const qn = qualifiedName(fileName, name);
    const decl = declarations.get(name);
    const exp = decl?.exported ? "export " : "";
    symbolDecls.push(`${exp}const __RFLCT_${name} = Symbol.for(${JSON.stringify(qn)});`);
  }
  if (symbolDecls.length > 0) {
    // Insert after imports, before first non-import statement.
    const insertPos = findFirstNonImport(body);
    edits.push({ start: insertPos, end: insertPos, replacement: symbolDecls.join("\n") + "\n" });
  }

  // Inject design:arguments metadata after each class.
  for (const ref of reflections) {
    const entries = ref.params.map((p) => `{ type: ${p.type}, metadata: ${p.metadata} }`);
    const array = `[${entries.join(", ")}]`;
    const target = ref.methodName === null
      ? ref.className
      : `${ref.className}.prototype`;
    const key = ref.methodName === null
      ? "undefined"
      : JSON.stringify(ref.methodName);
    const call = `\nReflect.defineMetadata("design:arguments", ${array}, ${target}, ${key});`;
    edits.push({ start: ref.insertAfter, end: ref.insertAfter, replacement: call });
  }

  // Replace resolve<T>() calls.
  for (const call of resolveCalls) {
    edits.push({ start: call.start, end: call.end, replacement: call.replacement });
  }

  // Inject design:symbols at end of file.
  const symbolEntries = [];
  for (const [name, info] of declarations) {
    if (info.kind === "class" || neededSymbols.has(name) || info.kind === "interface" || info.kind === "type") {
      const qn = qualifiedName(fileName, name);
      const value = info.kind === "class" ? name : `__RFLCT_${name}`;
      symbolEntries.push(`  ${JSON.stringify(qn)}: ${value}`);
    }
  }
  if (symbolEntries.length > 0) {
    const map = `{\n${symbolEntries.join(",\n")}\n}`;
    const injection = `\nReflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, ${map}), Reflect);\n`;
    edits.push({ start: source.length, end: source.length, replacement: injection });
  }

  // Apply edits from end to start.
  const code = applyEdits(source, edits);
  return { code, transformed: true };
}

function extractDecl(node) {
  const exported = hasExportKeyword(node);
  let inner = node;
  if (node.type === "ExportNamedDeclaration" && node.declaration) {
    inner = node.declaration;
  }
  if (node.type === "ExportDefaultDeclaration" && node.declaration) {
    inner = node.declaration;
  }
  switch (inner.type) {
    case "ClassDeclaration":
      if (inner.id) return { name: inner.id.name, kind: "class", exported, end: node.end };
      break;
    case "TSInterfaceDeclaration":
      return { name: inner.id.name, kind: "interface", exported, end: node.end };
    case "TSTypeAliasDeclaration":
      return { name: inner.id.name, kind: "type", exported, end: node.end };
    case "TSEnumDeclaration":
      return { name: inner.id.name, kind: "class", exported, end: node.end };
  }
  return null;
}

function hasExportKeyword(node) {
  return (
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExportDefaultDeclaration"
  );
}

function collectClassReflections(classNode, source, declarations, reflections, neededSymbols) {
  const className = classNode.id?.name;
  if (!className) return;
  for (const member of classNode.body.body) {
    if (member.type !== "MethodDefinition" && member.type !== "PropertyDefinition") continue;
    if (member.type === "PropertyDefinition") continue;
    const fn = member.value;
    if (!fn || !fn.params) continue;
    const params = [];
    for (const param of fn.params) {
      const p = unwrapParam(param);
      const marker = extractReflectMarker(p.typeAnnotation);
      if (!marker) continue;
      const serialized = serializeTypeNode(marker.typeNode, declarations);
      const metadata = serializeMetadataNode(marker.metadataNode, source);
      params.push({ type: serialized, metadata });
      // Track if we need a symbol binding.
      trackNeededSymbol(marker.typeNode, declarations, neededSymbols);
    }
    if (params.length === 0) continue;
    const methodName = member.kind === "constructor"
      ? null
      : (member.key.name ?? member.key.value ?? null);
    reflections.push({
      className,
      methodName,
      params,
      insertAfter: findClassEnd(classNode),
    });
  }
}

function findClassEnd(classNode) {
  return classNode.end;
}

// TSParameterProperty wraps `public x: T` — unwrap to the actual identifier.
function unwrapParam(param) {
  if (param.type === "TSParameterProperty") return unwrapParam(param.parameter);
  if (param.type === "AssignmentPattern") return param.left;
  return param;
}

function trackNeededSymbol(typeNode, declarations, neededSymbols) {
  if (typeNode.type !== "TSTypeReference") return;
  const name = typeNode.typeName?.name;
  if (!name) return;
  const decl = declarations.get(name);
  if (decl && decl.kind !== "class") {
    neededSymbols.add(name);
  }
}

function walkForResolveCalls(node, declarations, resolveCalls, neededSymbols) {
  if (!node || typeof node !== "object") return;
  if (node.type === "CallExpression") {
    const callee = node.callee;
    if (callee?.type === "Identifier" && callee.name === RESOLVE_NAME && node.typeArguments) {
      const typeParam = node.typeArguments.params?.[0];
      if (typeParam?.type === "TSTypeReference" && typeParam.typeName?.type === "Identifier") {
        const typeName = typeParam.typeName.name;
        const decl = declarations.get(typeName);
        let replacement;
        if (decl && decl.kind === "class") {
          // For classes, resolve<T>(T) → T. Use the argument if given, else the class name.
          replacement = node.arguments.length > 0 ? typeName : typeName;
        } else {
          // For interfaces/types → Symbol.
          neededSymbols.add(typeName);
          replacement = `__RFLCT_${typeName}`;
        }
        resolveCalls.push({ start: node.start, end: node.end, replacement });
      }
    }
  }
  // Recurse into children.
  for (const key of Object.keys(node)) {
    if (key === "start" || key === "end" || key === "type") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walkForResolveCalls(item, declarations, resolveCalls, neededSymbols);
        }
      }
    } else if (child && typeof child === "object" && child.type) {
      walkForResolveCalls(child, declarations, resolveCalls, neededSymbols);
    }
  }
}

function findFirstNonImport(body) {
  for (const node of body) {
    if (node.type !== "ImportDeclaration") return node.start;
  }
  return 0;
}

function applyEdits(source, edits) {
  // Sort by start descending so we can apply from end without shifting offsets.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = source;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
