// Serializes a TS type-level node to a runtime expression string.
// Mirrors TypeScript's own emitDecoratorMetadata rules.

/* eslint-disable @typescript-eslint/no-explicit-any */

const MARKER_NAME = 'Reflect';

interface DeclInfo {
  kind: string;
  name: string;
  exported: boolean;
  end: number;
}

export function serializeTypeNode(
  node: any,
  declarations: Map<string, DeclInfo>,
): string {
  if (!node) return 'Object';
  switch (node.type) {
    case 'TSStringKeyword':
      return 'String';
    case 'TSNumberKeyword':
      return 'Number';
    case 'TSBooleanKeyword':
      return 'Boolean';
    case 'TSBigIntKeyword':
      return 'BigInt';
    case 'TSSymbolKeyword':
      return 'Symbol';
    case 'TSVoidKeyword':
    case 'TSUndefinedKeyword':
    case 'TSNullKeyword':
      return 'void 0';
    case 'TSArrayType':
    case 'TSTupleType':
      return 'Array';
    case 'TSFunctionType':
    case 'TSConstructorType':
      return 'Function';
    case 'TSParenthesizedType':
      return serializeTypeNode(node.typeAnnotation, declarations);
    case 'TSTypeReference': {
      const name: string | null = identifierName(node.typeName);
      if (!name) return 'Object';
      const decl: DeclInfo | undefined = declarations.get(name);
      if (decl) {
        return decl.kind === 'class' ? name : `__RFLCT_${name}`;
      }
      return name;
    }
    default:
      return 'Object';
  }
}

function identifierName(node: any): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'TSQualifiedName') {
    const left: string | null = identifierName(node.left);
    return left ? `${left}.${node.right.name}` : null;
  }
  return null;
}

export interface ReflectMarker {
  typeNode: any;
  metadataNode: any | null;
  aliasName: string | null;
  allTypeParams: any[];
}

export function extractReflectMarker(typeAnnotation: any, markerNames?: Set<string>): ReflectMarker | null {
  if (!typeAnnotation) return null;
  const typeRef: any = typeAnnotation.typeAnnotation;
  if (!typeRef || typeRef.type !== 'TSTypeReference') return null;
  if (!typeRef.typeName || typeRef.typeName.type !== 'Identifier') return null;
  const name: string = typeRef.typeName.name;
  const isCanonical: boolean = name === MARKER_NAME;
  if (!isCanonical && !(markerNames?.has(name))) return null;
  const params: any[] | undefined = typeRef.typeArguments?.params;
  if (!params || params.length === 0) return null;
  return {
    typeNode: params[0],
    metadataNode: isCanonical ? (params[1] ?? null) : null,
    aliasName: isCanonical ? null : name,
    allTypeParams: params,
  };
}

export function serializeMetadataNode(node: any, source: string): string {
  if (!node) return '{}';
  return source.slice(node.start, node.end);
}
