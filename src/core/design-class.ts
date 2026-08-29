/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ClassMetadataInfo, Edit } from './types.js';
import { WITH_REFLECT_METADATA_NAME } from './types.js';
import { serializeMetadataNode } from './serialize.js';

export function collectClassMetadataAliases(
  body: any[],
  markerImports: Set<string>,
): Map<string, any> {
  const aliases = new Map<string, any>();
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
        aliases.set(inner.id.name, typeNode.typeArguments?.params?.[0] ?? null);
      }
    }
  }
  return aliases;
}

export function collectClassMetadata(
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
    const name: string | undefined = impl.expression?.name;
    if (!name) continue;

    if (name === WITH_REFLECT_METADATA_NAME && markerImports.has(WITH_REFLECT_METADATA_NAME)) {
      const metaNode: any = impl.typeArguments?.params?.[0];
      const metadataExpr: string = metaNode ? serializeMetadataNode(metaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }

    if (classMetadataAliasSet?.has(name) && markerImports.has(name)) {
      const metaNode: any = impl.typeArguments?.params?.[0];
      const metadataExpr: string = metaNode ? serializeMetadataNode(metaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }

    const aliasMetaNode: any | undefined = classMetadataAliases.get(name);
    if (aliasMetaNode !== undefined) {
      const metadataExpr: string = aliasMetaNode ? serializeMetadataNode(aliasMetaNode, source) : '{}';
      classMetadataList.push({ className, metadataExpr, insertAfter: insertPos });
      return;
    }
  }
}

export function classHasAutoReflect(
  classNode: any,
  markerImports: Set<string>,
  classMetadataAliases: Map<string, any>,
  classMetadataAliasSet?: Set<string>,
): boolean {
  const impls: any[] | undefined = classNode.implements;
  if (!impls) return false;
  for (const impl of impls) {
    const name: string | undefined = impl.expression?.name;
    if (!name) continue;
    if (name === WITH_REFLECT_METADATA_NAME && markerImports.has(WITH_REFLECT_METADATA_NAME)) return true;
    if (classMetadataAliasSet?.has(name) && markerImports.has(name)) return true;
    if (classMetadataAliases.has(name)) return true;
  }
  return false;
}

export function emitClassMetadataEdits(classMetadataList: ClassMetadataInfo[]): Edit[] {
  const edits: Edit[] = [];
  for (const cm of classMetadataList) {
    const call = `\nReflect.defineMetadata("design:class", ${cm.metadataExpr}, ${cm.className});`;
    edits.push({ start: cm.insertAfter, end: cm.insertAfter, replacement: call });
  }
  return edits;
}
