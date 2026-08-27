/* eslint-disable @typescript-eslint/no-explicit-any */

import { parseSync } from 'oxc-parser';

import { qualifiedName } from './package.js';
import {
  extractReflectMarker,
  serializeMetadataNode,
  serializeTypeNode,
} from './serialize.js';

const MARKER_NAME = 'Reflect';
const RESOLVE_NAME = 'resolve';
const WITH_REFLECT_METADATA_NAME = 'WithReflectMetadata';
const PACKAGE_NAMES: string[] = ['rflct', 'rflct'];

function isPackageImport(src: string): boolean {
  return PACKAGE_NAMES.some(
    (name: string) => src === name || src.startsWith(name + '/'),
  );
}

interface DeclInfo {
  kind: string;
  name: string;
  exported: boolean;
  end: number;
  topLevel?: boolean;
}

interface ParamEntry {
  type: string;
  metadata: string;
  elementType?: string;
}

interface ReflectionInfo {
  className: string;
  // null = constructor, string = method or property name
  methodName: string | null;
  // For computed property keys (e.g., [symbol]), stores the raw expression
  computedKey?: string;
  params: ParamEntry[];
  insertAfter: number;
  isProperty?: boolean;
}

interface ResolveCallInfo {
  start: number;
  end: number;
  replacement: string;
}

interface ClassMetadataInfo {
  className: string;
  metadataExpr: string;
  insertAfter: number;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

export interface ReflectAliasConfig {
  // Static metadata merged into output (e.g., { multi: true })
  staticMetadata?: Record<string, unknown>;
  // If true, first type param is element type; emitted type is Array
  isArray?: boolean;
  // Maps type param indices (0-based, skipping the first/main type) to metadata keys
  // e.g., { name: 0 } means second type param → metadata.name
  typeParamToMeta?: Record<string, number>;
  // For tags: extracts key and value from type params as { [key]: value }
  tagsFromParams?: { keyParam: number; valueParam: number };
}

export interface TransformOptions {
  checkerInfo?: Map<string, 'class' | 'interface' | 'type'>;
  include?: RegExp;
  exclude?: RegExp;
  // Alias names mapped to their implicit config
  reflectAliases?: Record<string, ReflectAliasConfig>;
  // Additional names treated as WithReflectMetadata markers (e.g. ['Injectable'])
  classMetadataAliases?: string[];
  // Additional import source patterns to treat as rflct sources
  importSources?: RegExp;
}

export interface TransformResult {
  code: string;
  transformed: boolean;
}

export function transform(
  source: string,
  fileName: string,
  options?: TransformOptions,
): TransformResult {
  const result = parseSync(fileName, source);
  if (result.errors.length > 0) {
    return { code: source, transformed: false };
  }

  const body: any[] = result.program.body;

  // Build sets of known marker names (canonical + configured aliases).
  const reflectAliasMap: Map<string, ReflectAliasConfig> | undefined =
    options?.reflectAliases ? new Map(Object.entries(options.reflectAliases)) : undefined;
  const reflectAliasSet: Set<string> | undefined =
    reflectAliasMap ? new Set(reflectAliasMap.keys()) : undefined;
  const classMetadataAliasSet: Set<string> | undefined =
    options?.classMetadataAliases ? new Set(options.classMetadataAliases) : undefined;

  // Collect imports from the marker package (or matching importSources pattern).
  const markerImports = new Set<string>();
  const importedNames = new Map<string, { source: string; typeOnly: boolean }>();
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src: string = node.source.value;
    const isMarkerSource: boolean = isPackageImport(src) || (options?.importSources?.test(src) ?? false);
    if (isMarkerSource) {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier') {
          markerImports.add(spec.local.name);
        }
      }
    } else {
      // Check if any imported names match configured aliases.
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier') {
          const localName: string = spec.local.name;
          if (
            reflectAliasSet?.has(localName) ||
            classMetadataAliasSet?.has(localName) ||
            localName === RESOLVE_NAME
          ) {
            markerImports.add(localName);
          }
        }
      }
    }
    if (node.importKind === 'type') {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier') {
          importedNames.set(spec.local.name, { source: src, typeOnly: true });
        }
      }
    } else {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier') {
          importedNames.set(spec.local.name, {
            source: src,
            typeOnly: spec.importKind === 'type',
          });
        }
      }
    }
  }

  const hasAnyMarker: boolean =
    markerImports.has(MARKER_NAME) ||
    markerImports.has(RESOLVE_NAME) ||
    markerImports.has(WITH_REFLECT_METADATA_NAME) ||
    (reflectAliasSet !== undefined && [...reflectAliasSet].some((n: string) => markerImports.has(n))) ||
    (classMetadataAliasSet !== undefined && [...classMetadataAliasSet].some((n: string) => markerImports.has(n)));

  if (!hasAnyMarker) {
    return { code: source, transformed: false };
  }

  // Collect top-level declarations.
  const declarations = new Map<string, DeclInfo>();
  for (const node of body) {
    const info: DeclInfo | null = extractDecl(node);
    if (info) {
      info.topLevel = true;
      declarations.set(info.name, info);
    }
  }

  // Also collect nested class declarations (common in test files).
  walkAllNodesWithScope(body, source.length, (node: any) => {
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      if (!declarations.has(node.id.name)) {
        declarations.set(node.id.name, { kind: 'class', name: node.id.name, exported: false, end: node.end, topLevel: false });
      }
    }
  });

  if (options?.checkerInfo) {
    for (const [name, kind] of options.checkerInfo) {
      if (declarations.has(name)) {
        declarations.get(name)!.kind = kind;
      } else {
        declarations.set(name, { kind, name, exported: false, end: -1 });
      }
    }
  }

  const reflections: ReflectionInfo[] = [];
  const resolveCalls: ResolveCallInfo[] = [];
  const classMetadataList: ClassMetadataInfo[] = [];
  const neededSymbols = new Set<string>();

  // Track same-file type aliases resolving to WithReflectMetadata<T>.
  const classMetadataAliases = new Map<string, any>();
  for (const node of body) {
    let inner: any = node;
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      inner = node.declaration;
    }
    if (inner.type === 'TSTypeAliasDeclaration') {
      const typeNode: any = inner.typeAnnotation;
      if (
        typeNode?.type === 'TSTypeReference' &&
        typeNode.typeName?.type === 'Identifier' &&
        typeNode.typeName.name === WITH_REFLECT_METADATA_NAME &&
        markerImports.has(WITH_REFLECT_METADATA_NAME)
      ) {
        classMetadataAliases.set(inner.id.name, typeNode.typeArguments?.params?.[0] ?? null);
      }
    }
  }

  // Walk all nodes (including nested) for class reflections and resolve calls.
  // First pass: find last class end per scope for proper insertion ordering.
  const lastClassEndPerScope = new Map<number, number>(); // scopeEnd → lastClassEnd
  walkAllNodesWithScope(body, source.length, (node: any, scopeEnd: number) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const current: number = lastClassEndPerScope.get(scopeEnd) ?? 0;
      if (node.end > current) {
        lastClassEndPerScope.set(scopeEnd, node.end);
      }
    }
  });

  // Second pass: collect reflections using last-class-end as insertion point.
  walkAllNodesWithScope(body, source.length, (node: any, scopeEnd: number) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const insertAt: number = lastClassEndPerScope.get(scopeEnd) ?? node.end;
      collectClassReflections(node, source, declarations, reflections, neededSymbols, reflectAliasSet, insertAt, reflectAliasMap);
      collectClassMetadata(node, source, markerImports, classMetadataAliases, classMetadataList, classMetadataAliasSet, insertAt);
    }
  });
  for (const node of body) {
    walkForResolveCalls(node, declarations, resolveCalls, neededSymbols);
  }

  if (reflections.length === 0 && resolveCalls.length === 0 && classMetadataList.length === 0) {
    return { code: source, transformed: false };
  }

  const edits: Edit[] = [];

  // Remove marker imports.
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src: string = node.source.value;
    if (isPackageImport(src)) {
      edits.push({ start: node.start, end: node.end, replacement: '' });
    }
  }

  // Symbol declarations for type-only references.
  const symbolDecls: string[] = [];
  for (const name of neededSymbols) {
    const qn: string = qualifiedName(fileName, name);
    const decl: DeclInfo | undefined = declarations.get(name);
    const exp: string = decl?.exported ? 'export ' : '';
    symbolDecls.push(`${exp}const __RFLCT_${name} = Symbol.for(${JSON.stringify(qn)});`);
  }
  if (symbolDecls.length > 0) {
    const insertPos: number = findFirstNonImport(body);
    edits.push({
      start: insertPos,
      end: insertPos,
      replacement: symbolDecls.join('\n') + '\n',
    });
  }

  // Inject design:paramtypes metadata after each class.
  // Group reflections by class+scope to emit design:properties.
  const classPropertyNames = new Map<string, { className: string; insertAfter: number; props: string[] }>();

  for (const ref of reflections) {
    const entries: string[] = ref.params.map((p: ParamEntry) => {
      let entry = `{ type: ${p.type}, metadata: ${p.metadata}`;
      if (p.elementType) entry += `, elementType: ${p.elementType}`;
      return entry + ' }';
    });
    const array: string = `[${entries.join(', ')}]`;
    const target: string =
      ref.methodName === null ? ref.className : `${ref.className}.prototype`;
    const key: string =
      ref.methodName === null ? 'undefined'
        : ref.computedKey ? ref.computedKey
        : JSON.stringify(ref.methodName);
    const call = `\nReflect.defineMetadata("design:paramtypes", ${array}, ${target}, ${key});`;
    edits.push({ start: ref.insertAfter, end: ref.insertAfter, replacement: call });

    if (ref.isProperty === true && ref.methodName !== null) {
      const scopeKey: string = `${ref.className}@${ref.insertAfter}`;
      let entry = classPropertyNames.get(scopeKey);
      if (entry === undefined) {
        entry = { className: ref.className, insertAfter: ref.insertAfter, props: [] };
        classPropertyNames.set(scopeKey, entry);
      }
      entry.props.push(ref.computedKey ?? JSON.stringify(ref.methodName));
    }
  }

  // Emit design:properties for each class that has property-level metadata.
  for (const [, entry] of classPropertyNames) {
    const propList: string = `[${entry.props.join(', ')}]`;
    const call = `\nReflect.defineMetadata("design:properties", ${propList}, ${entry.className});`;
    edits.push({ start: entry.insertAfter, end: entry.insertAfter, replacement: call });
  }

  // Emit design:class for classes with WithReflectMetadata in implements.
  for (const cm of classMetadataList) {
    const call = `\nReflect.defineMetadata("design:class", ${cm.metadataExpr}, ${cm.className});`;
    edits.push({ start: cm.insertAfter, end: cm.insertAfter, replacement: call });
  }

  // Replace resolve<T>() calls.
  for (const call of resolveCalls) {
    edits.push({ start: call.start, end: call.end, replacement: call.replacement });
  }

  // Inject design:symbols at end of file (only top-level declarations).
  const symbolEntries: string[] = [];
  for (const [name, info] of declarations) {
    if (!info.topLevel) continue;
    if (info.kind === 'class' || neededSymbols.has(name)) {
      const qn: string = qualifiedName(fileName, name);
      const value: string = info.kind === 'class' ? name : `__RFLCT_${name}`;
      symbolEntries.push(`  ${JSON.stringify(qn)}: ${value}`);
    }
  }
  if (symbolEntries.length > 0) {
    const map = `{\n${symbolEntries.join(',\n')}\n}`;
    const injection = `\nReflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, ${map}), Reflect);\n`;
    edits.push({ start: source.length, end: source.length, replacement: injection });
  }

  const code: string = applyEdits(source, edits);
  return { code, transformed: true };
}

function extractDecl(node: any): DeclInfo | null {
  const exported: boolean = hasExportKeyword(node);
  let inner: any = node;
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    inner = node.declaration;
  }
  if (node.type === 'ExportDefaultDeclaration' && node.declaration) {
    inner = node.declaration;
  }
  switch (inner.type) {
    case 'ClassDeclaration':
      if (inner.id)
        return { name: inner.id.name, kind: 'class', exported, end: node.end };
      break;
    case 'TSInterfaceDeclaration':
      return { name: inner.id.name, kind: 'interface', exported, end: node.end };
    case 'TSTypeAliasDeclaration':
      return { name: inner.id.name, kind: 'type', exported, end: node.end };
    case 'TSEnumDeclaration':
      return { name: inner.id.name, kind: 'class', exported, end: node.end };
  }
  return null;
}

function hasExportKeyword(node: any): boolean {
  return (
    node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportDefaultDeclaration'
  );
}

function buildParamEntry(
  marker: import('./serialize.js').ReflectMarker,
  source: string,
  declarations: Map<string, DeclInfo>,
  neededSymbols: Set<string>,
  reflectAliasMap?: Map<string, ReflectAliasConfig>,
): ParamEntry {
  const aliasConfig: ReflectAliasConfig | undefined =
    marker.aliasName ? reflectAliasMap?.get(marker.aliasName) : undefined;

  let elementType: string | undefined;

  if (aliasConfig?.isArray) {
    elementType = serializeTypeNode(marker.typeNode, declarations);
    trackNeededSymbol(marker.typeNode, declarations, neededSymbols);
    const metadata: string = buildAliasMetadata(aliasConfig, marker.allTypeParams, source);
    return { type: 'Array', metadata, elementType };
  }

  if (marker.typeNode.type === 'TSArrayType' && marker.typeNode.elementType) {
    elementType = serializeTypeNode(marker.typeNode.elementType, declarations);
    trackNeededSymbol(marker.typeNode.elementType, declarations, neededSymbols);
  }

  const serialized: string = serializeTypeNode(marker.typeNode, declarations);
  trackNeededSymbol(marker.typeNode, declarations, neededSymbols);

  if (aliasConfig) {
    const metadata: string = buildAliasMetadata(aliasConfig, marker.allTypeParams, source);
    return { type: serialized, metadata, elementType };
  }

  const metadata: string = serializeMetadataNode(marker.metadataNode, source);
  return { type: serialized, metadata, elementType };
}

function buildAliasMetadata(
  config: ReflectAliasConfig,
  typeParams: any[],
  source: string,
): string {
  const parts: string[] = [];

  if (config.staticMetadata) {
    for (const [key, value] of Object.entries(config.staticMetadata)) {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (config.typeParamToMeta) {
    for (const [metaKey, paramIndex] of Object.entries(config.typeParamToMeta)) {
      const param: any = typeParams[paramIndex + 1]; // +1 because index 0 is the main type
      if (param) {
        parts.push(`${metaKey}: ${serializeLiteralType(param, source)}`);
      }
    }
  }

  if (config.tagsFromParams) {
    const keyParam: any = typeParams[config.tagsFromParams.keyParam + 1];
    const valueParam: any = typeParams[config.tagsFromParams.valueParam + 1];
    if (keyParam && valueParam) {
      const key: string = serializeLiteralType(keyParam, source);
      const value: string = serializeLiteralType(valueParam, source);
      parts.push(`tags: { [${key}]: ${value} }`);
    }
  }

  return `{ ${parts.join(', ')} }`;
}

function serializeLiteralType(node: any, source: string): string {
  if (!node) return 'undefined';
  switch (node.type) {
    case 'TSLiteralType':
      return source.slice(node.start, node.end);
    default:
      return source.slice(node.start, node.end);
  }
}

function collectClassReflections(
  classNode: any,
  source: string,
  declarations: Map<string, DeclInfo>,
  reflections: ReflectionInfo[],
  neededSymbols: Set<string>,
  reflectAliasSet?: Set<string>,
  scopeEnd?: number,
  reflectAliasMap?: Map<string, ReflectAliasConfig>,
): void {
  const className: string | undefined = classNode.id?.name;
  if (!className) return;
  const insertPos: number = scopeEnd ?? classNode.end;
  for (const member of classNode.body.body) {
    if (member.type !== 'MethodDefinition' && member.type !== 'PropertyDefinition')
      continue;

    if (member.type === 'PropertyDefinition') {
      const marker = extractReflectMarker(member.typeAnnotation, reflectAliasSet);
      if (!marker) continue;
      const entry: ParamEntry = buildParamEntry(marker, source, declarations, neededSymbols, reflectAliasMap);
      const propName: string = member.computed
        ? source.slice(member.key.start, member.key.end)
        : (member.key.name ?? member.key.value);
      reflections.push({
        className,
        methodName: propName,
        computedKey: member.computed ? propName : undefined,
        params: [entry],
        insertAfter: insertPos,
        isProperty: true,
      });
      continue;
    }

    const fn: any = member.value;
    if (!fn || !fn.params) continue;
    const params: ParamEntry[] = [];
    for (const param of fn.params) {
      const p: any = unwrapParam(param);
      const marker = extractReflectMarker(p.typeAnnotation, reflectAliasSet);
      if (!marker) continue;
      params.push(buildParamEntry(marker, source, declarations, neededSymbols, reflectAliasMap));
    }
    if (params.length === 0) continue;
    const methodName: string | null =
      member.kind === 'constructor'
        ? null
        : (member.key.name ?? member.key.value ?? null);
    reflections.push({
      className,
      methodName,
      params,
      insertAfter: insertPos,
      isProperty: member.kind === 'set' ? true : undefined,
    });
  }
}

function collectClassMetadata(
  classNode: any,
  source: string,
  markerImports: Set<string>,
  classMetadataAliases: Map<string, any>,
  classMetadataList: ClassMetadataInfo[],
  classMetadataAliasSet?: Set<string>,
  scopeEnd?: number,
): void {
  const className: string | undefined = classNode.id?.name;
  if (!className) return;
  const insertPos: number = scopeEnd ?? classNode.end;
  const impls: any[] | undefined = classNode.implements;
  if (!impls || impls.length === 0) return;

  for (const impl of impls) {
    // oxc-parser: TSClassImplements { expression: Identifier, typeArguments?: ... }
    const name: string | undefined = impl.expression?.name;
    if (!name) continue;

    // Direct WithReflectMetadata<T> usage
    if (name === WITH_REFLECT_METADATA_NAME && markerImports.has(WITH_REFLECT_METADATA_NAME)) {
      const metaNode: any = impl.typeArguments?.params?.[0];
      const metadataExpr: string = metaNode ? serializeMetadataNode(metaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }

    // Configured classMetadataAliases (e.g. 'Injectable')
    if (classMetadataAliasSet?.has(name) && markerImports.has(name)) {
      const metaNode: any = impl.typeArguments?.params?.[0];
      const metadataExpr: string = metaNode ? serializeMetadataNode(metaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }

    // Same-file type alias resolving to WithReflectMetadata<T>
    const aliasMetaNode: any | undefined = classMetadataAliases.get(name);
    if (aliasMetaNode !== undefined) {
      const metadataExpr: string = aliasMetaNode ? serializeMetadataNode(aliasMetaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }
  }
}

function unwrapParam(param: any): any {
  if (param.type === 'TSParameterProperty') return unwrapParam(param.parameter);
  if (param.type === 'AssignmentPattern') return param.left;
  return param;
}

function trackNeededSymbol(
  typeNode: any,
  declarations: Map<string, DeclInfo>,
  neededSymbols: Set<string>,
): void {
  if (typeNode.type !== 'TSTypeReference') return;
  const name: string | undefined = typeNode.typeName?.name;
  if (!name) return;
  const decl: DeclInfo | undefined = declarations.get(name);
  if (decl && decl.kind !== 'class') {
    neededSymbols.add(name);
  }
}

function walkForResolveCalls(
  node: any,
  declarations: Map<string, DeclInfo>,
  resolveCalls: ResolveCallInfo[],
  neededSymbols: Set<string>,
): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression') {
    const callee: any = node.callee;
    if (
      callee?.type === 'Identifier' &&
      callee.name === RESOLVE_NAME &&
      node.typeArguments
    ) {
      const typeParam: any = node.typeArguments.params?.[0];
      if (
        typeParam?.type === 'TSTypeReference' &&
        typeParam.typeName?.type === 'Identifier'
      ) {
        const typeName: string = typeParam.typeName.name;
        const decl: DeclInfo | undefined = declarations.get(typeName);
        let replacement: string;
        if (decl && decl.kind === 'class') {
          replacement = typeName;
        } else {
          neededSymbols.add(typeName);
          replacement = `__RFLCT_${typeName}`;
        }
        resolveCalls.push({ start: node.start, end: node.end, replacement });
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const child: any = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkForResolveCalls(item, declarations, resolveCalls, neededSymbols);
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkForResolveCalls(child, declarations, resolveCalls, neededSymbols);
    }
  }
}

function walkAllNodesWithScope(nodes: any[], scopeEnd: number, visitor: (node: any, scopeEnd: number) => void): void {
  for (const node of nodes) {
    walkNodeWithScope(node, scopeEnd, visitor);
  }
}

function walkNodeWithScope(node: any, scopeEnd: number, visitor: (node: any, scopeEnd: number) => void): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node, scopeEnd);
  // Update scopeEnd when entering a new function/arrow body.
  let childScopeEnd: number = scopeEnd;
  if (
    (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration') &&
    node.body?.type === 'BlockStatement'
  ) {
    // Insert before the closing brace of the block.
    childScopeEnd = node.body.end - 1;
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const child: any = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkNodeWithScope(item, childScopeEnd, visitor);
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkNodeWithScope(child, childScopeEnd, visitor);
    }
  }
}

function findFirstNonImport(body: any[]): number {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') return node.start;
  }
  return 0;
}

function applyEdits(source: string, edits: Edit[]): string {
  edits.sort((a: Edit, b: Edit) => b.start - a.start || b.end - a.end);
  let result: string = source;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
