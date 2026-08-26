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
const PACKAGE_NAME = 'rflct';

interface DeclInfo {
  kind: string;
  name: string;
  exported: boolean;
  end: number;
}

interface ParamEntry {
  type: string;
  metadata: string;
  elementType?: string;
}

interface ReflectionInfo {
  className: string;
  methodName: string | null;
  params: ParamEntry[];
  insertAfter: number;
}

interface ResolveCallInfo {
  start: number;
  end: number;
  replacement: string;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

export interface TransformOptions {
  checkerInfo?: Map<string, 'class' | 'interface' | 'type'>;
  include?: RegExp;
  exclude?: RegExp;
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

  // Collect imports from the marker package.
  const markerImports = new Set<string>();
  const importedNames = new Map<string, { source: string; typeOnly: boolean }>();
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src: string = node.source.value;
    if (src === PACKAGE_NAME || src.startsWith(PACKAGE_NAME + '/')) {
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier') {
          markerImports.add(spec.local.name);
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

  if (!markerImports.has(MARKER_NAME) && !markerImports.has(RESOLVE_NAME)) {
    return { code: source, transformed: false };
  }

  // Collect top-level declarations.
  const declarations = new Map<string, DeclInfo>();
  for (const node of body) {
    const info: DeclInfo | null = extractDecl(node);
    if (info) declarations.set(info.name, info);
  }

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
  const neededSymbols = new Set<string>();

  for (const node of body) {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      collectClassReflections(node, source, declarations, reflections, neededSymbols);
    }
    walkForResolveCalls(node, declarations, resolveCalls, neededSymbols);
  }

  if (reflections.length === 0 && resolveCalls.length === 0) {
    return { code: source, transformed: false };
  }

  const edits: Edit[] = [];

  // Remove marker imports.
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src: string = node.source.value;
    if (src === PACKAGE_NAME || src.startsWith(PACKAGE_NAME + '/')) {
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
      ref.methodName === null ? 'undefined' : JSON.stringify(ref.methodName);
    const call = `\nReflect.defineMetadata("design:paramtypes", ${array}, ${target}, ${key});`;
    edits.push({ start: ref.insertAfter, end: ref.insertAfter, replacement: call });
  }

  // Replace resolve<T>() calls.
  for (const call of resolveCalls) {
    edits.push({ start: call.start, end: call.end, replacement: call.replacement });
  }

  // Inject design:symbols at end of file.
  const symbolEntries: string[] = [];
  for (const [name, info] of declarations) {
    if (
      info.kind === 'class' ||
      neededSymbols.has(name) ||
      info.kind === 'interface' ||
      info.kind === 'type'
    ) {
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

function collectClassReflections(
  classNode: any,
  source: string,
  declarations: Map<string, DeclInfo>,
  reflections: ReflectionInfo[],
  neededSymbols: Set<string>,
): void {
  const className: string | undefined = classNode.id?.name;
  if (!className) return;
  for (const member of classNode.body.body) {
    if (member.type !== 'MethodDefinition' && member.type !== 'PropertyDefinition')
      continue;
    if (member.type === 'PropertyDefinition') continue;
    const fn: any = member.value;
    if (!fn || !fn.params) continue;
    const params: ParamEntry[] = [];
    for (const param of fn.params) {
      const p: any = unwrapParam(param);
      const marker = extractReflectMarker(p.typeAnnotation);
      if (!marker) continue;
      const serialized: string = serializeTypeNode(marker.typeNode, declarations);
      const metadata: string = serializeMetadataNode(marker.metadataNode, source);
      // For array types (T[]), extract the element type for DI multi-inject.
      let elementType: string | undefined;
      if (marker.typeNode.type === 'TSArrayType' && marker.typeNode.elementType) {
        elementType = serializeTypeNode(marker.typeNode.elementType, declarations);
        trackNeededSymbol(marker.typeNode.elementType, declarations, neededSymbols);
      }
      params.push({ type: serialized, metadata, elementType });
      trackNeededSymbol(marker.typeNode, declarations, neededSymbols);
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
      insertAfter: classNode.end,
    });
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
