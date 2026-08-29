/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeclInfo, Edit, ParamEntry, ReflectAliasConfig, ReflectionInfo } from './types.js';
import {
  extractReflectMarker,
  serializeMetadataNode,
  serializeTypeNode,
} from './serialize.js';

export function buildRawTypeEntry(
  typeAnnotation: any,
  declarations: Map<string, DeclInfo>,
  neededSymbols: Set<string>,
): ParamEntry {
  const typeNode: any = typeAnnotation?.typeAnnotation;
  if (!typeNode) return { type: 'Object', metadata: '{}' };
  const serialized: string = serializeTypeNode(typeNode, declarations);
  trackNeededSymbol(typeNode, declarations, neededSymbols);
  let elementType: string | undefined;
  if (typeNode.type === 'TSArrayType' && typeNode.elementType) {
    elementType = serializeTypeNode(typeNode.elementType, declarations);
    trackNeededSymbol(typeNode.elementType, declarations, neededSymbols);
  }
  return { type: serialized, metadata: '{}', elementType };
}

export function collectClassReflections(
  classNode: any,
  source: string,
  declarations: Map<string, DeclInfo>,
  reflections: ReflectionInfo[],
  neededSymbols: Set<string>,
  reflectAliasSet?: Set<string>,
  scopeEnd?: number,
  reflectAliasMap?: Map<string, ReflectAliasConfig>,
  autoReflect?: boolean,
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
      const typeNode: any = marker.typeNode;
      const propName: string = member.computed
        ? source.slice(member.key.start, member.key.end)
        : (member.key.name ?? member.key.value);
      const isFunctionType: boolean = marker.typeNode.type === 'TSFunctionType' || marker.typeNode.type === 'TSConstructorType';
      reflections.push({
        className,
        methodName: propName,
        computedKey: member.computed ? propName : undefined,
        params: [entry],
        insertAfter: insertPos,
        isProperty: isFunctionType ? undefined : true,
        fromPropertyDefinition: true,
      });
      continue;
    }

    const fn: any = member.value;
    if (!fn || !fn.params) continue;
    const params: ParamEntry[] = [];
    for (const param of fn.params) {
      const p: any = unwrapParam(param);
      const marker = extractReflectMarker(p.typeAnnotation, reflectAliasSet);
      if (marker) {
        params.push(buildParamEntry(marker, source, declarations, neededSymbols, reflectAliasMap));
      } else if (autoReflect && member.kind === 'constructor') {
        params.push(buildRawTypeEntry(p.typeAnnotation, declarations, neededSymbols));
      }
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

export function emitParamtypesEdits(
  reflections: ReflectionInfo[],
): { edits: Edit[]; classPropertyNames: Map<string, { className: string; insertAfter: number; props: string[] }> } {
  const edits: Edit[] = [];
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
    const metadataKey: string = ref.isProperty === true ? 'design:propertytype' : 'design:paramtypes';
    const call = `\nReflect.defineMetadata("${metadataKey}", ${array}, ${target}, ${key});`;
    edits.push({ start: ref.insertAfter, end: ref.insertAfter, replacement: call });

    if ((ref.fromPropertyDefinition === true || ref.isProperty === true) && ref.methodName !== null) {
      const scopeKey: string = `${ref.className}@${ref.insertAfter}`;
      let entry = classPropertyNames.get(scopeKey);
      if (entry === undefined) {
        entry = { className: ref.className, insertAfter: ref.insertAfter, props: [] };
        classPropertyNames.set(scopeKey, entry);
      }
      entry.props.push(ref.computedKey ?? JSON.stringify(ref.methodName));
    }
  }

  return { edits, classPropertyNames };
}

export function emitPropertiesEdits(
  classPropertyNames: Map<string, { className: string; insertAfter: number; props: string[] }>,
): Edit[] {
  const edits: Edit[] = [];
  for (const [, entry] of classPropertyNames) {
    const propList: string = `[${entry.props.join(', ')}]`;
    const call = `\nReflect.defineMetadata("design:properties", ${propList}, ${entry.className});`;
    edits.push({ start: entry.insertAfter, end: entry.insertAfter, replacement: call });
  }
  return edits;
}

export function buildParamEntry(
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

export function buildAliasMetadata(
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

export function serializeLiteralType(node: any, source: string): string {
  if (!node) return 'undefined';
  switch (node.type) {
    case 'TSLiteralType':
      return source.slice(node.start, node.end);
    default:
      return source.slice(node.start, node.end);
  }
}

export function unwrapParam(param: any): any {
  if (param.type === 'TSParameterProperty') return unwrapParam(param.parameter);
  if (param.type === 'AssignmentPattern') return param.left;
  return param;
}

export function trackNeededSymbol(
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
