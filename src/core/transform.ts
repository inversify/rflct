/* eslint-disable @typescript-eslint/no-explicit-any */

import { parseSync } from 'oxc-parser';
import { transformSync as oxcTransform } from 'oxc-transform';

import type {
  ClassMetadataInfo,
  DeclInfo,
  Edit,
  ReflectionInfo,
  ResolveCallInfo,
  TransformOptions,
  TransformResult,
} from './types.js';
import {
  MARKER_NAME,
  PACKAGE_NAMES,
  RESOLVE_NAME,
  WITH_REFLECT_METADATA_NAME,
} from './types.js';
import {
  applyEdits,
  extractDecl,
  findFirstNonImport,
  isPackageImport,
  walkAllNodesWithScope,
} from './ast.js';
import { collectClassReflections, emitParamtypesEdits, emitPropertiesEdits } from './design-paramtypes.js';
import { collectClassMetadata, collectClassMetadataAliases, classHasAutoReflect, emitClassMetadataEdits } from './design-class.js';
import { emitDesignSymbolsEdits, emitSymbolDeclarations } from './design-symbols.js';
import { collectResolveCall, emitResolveCallEdits } from './resolve-calls.js';

export type { TransformOptions, TransformResult, ReflectAliasConfig } from './types.js';

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
  const reflectAliasMap: Map<string, import('./types.js').ReflectAliasConfig> | undefined =
    options?.reflectAliases ? new Map(Object.entries(options.reflectAliases)) : undefined;
  const reflectAliasSet: Set<string> | undefined =
    reflectAliasMap ? new Set(reflectAliasMap.keys()) : undefined;
  const classMetadataAliasSet: Set<string> | undefined =
    options?.classMetadataAliases ? new Set(options.classMetadataAliases) : undefined;

  // Collect imports from the marker package (or matching importSources pattern).
  const markerImports = new Set<string>();
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

  // Also collect nested declarations (common in test files).
  walkAllNodesWithScope(body, source.length, (node: any) => {
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      if (!declarations.has(node.id.name)) {
        declarations.set(node.id.name, { kind: 'class', name: node.id.name, exported: false, end: node.end, topLevel: false });
      }
    } else if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      if (!declarations.has(node.id.name)) {
        declarations.set(node.id.name, { kind: 'interface', name: node.id.name, exported: false, end: node.end, topLevel: false });
      }
    } else if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      if (!declarations.has(node.id.name)) {
        declarations.set(node.id.name, { kind: 'type', name: node.id.name, exported: false, end: node.end, topLevel: false });
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

  // Track same-file type aliases resolving to Reflectable<T>.
  const classMetadataAliasMap = collectClassMetadataAliases(body, markerImports);

  // First pass: find last class end per scope for proper insertion ordering.
  const lastClassEndPerScope = new Map<number, number>();
  walkAllNodesWithScope(body, source.length, (node: any, scopeEnd: number) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const current: number = lastClassEndPerScope.get(scopeEnd) ?? 0;
      if (node.end > current) {
        lastClassEndPerScope.set(scopeEnd, node.end);
      }
    }
  }, declarations);

  // Second pass: collect reflections using last-class-end as insertion point.
  walkAllNodesWithScope(body, source.length, (node: any, scopeEnd: number, scopeDecls: Map<string, DeclInfo>) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const insertAt: number = lastClassEndPerScope.get(scopeEnd) ?? node.end;
      const autoReflect: boolean = classHasAutoReflect(node, markerImports, classMetadataAliasMap, classMetadataAliasSet);
      collectClassReflections(node, source, scopeDecls, reflections, neededSymbols, reflectAliasSet, insertAt, reflectAliasMap, autoReflect);
      collectClassMetadata(node, source, markerImports, classMetadataAliasMap, classMetadataList, classMetadataAliasSet, insertAt);
    }
  }, declarations);

  // Third pass: collect resolve() calls with scope-aware declarations.
  walkAllNodesWithScope(body, source.length, (node: any, _scopeEnd: number, scopeDecls: Map<string, DeclInfo>) => {
    if (node.type === 'CallExpression') {
      collectResolveCall(node, scopeDecls, resolveCalls, neededSymbols);
    }
  }, declarations);

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
  const insertPos: number = findFirstNonImport(body);
  edits.push(...emitSymbolDeclarations(neededSymbols, declarations, fileName, insertPos));

  // design:paramtypes / design:propertytype
  const { edits: paramEdits, classPropertyNames } = emitParamtypesEdits(reflections);
  edits.push(...paramEdits);

  // design:properties
  edits.push(...emitPropertiesEdits(classPropertyNames));

  // design:class
  edits.push(...emitClassMetadataEdits(classMetadataList));

  // resolve() call replacements
  edits.push(...emitResolveCallEdits(resolveCalls));

  // design:symbols at end of file
  edits.push(...emitDesignSymbolsEdits(declarations, neededSymbols, fileName, source.length));

  const code: string = applyEdits(source, edits);

  if (options?.transpile) {
    const jsResult = oxcTransform(fileName, code, { sourcemap: true });
    return { code: jsResult.code, map: JSON.stringify(jsResult.map), transformed: true };
  }

  return { code, transformed: true };
}
