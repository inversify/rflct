// Serializes a TS type-level node to a runtime expression string.
// Mirrors TypeScript's own emitDecoratorMetadata rules.

const MARKER_NAME = "Reflect";

export function serializeTypeNode(node, declarations) {
  if (!node) return "Object";
  switch (node.type) {
    case "TSStringKeyword":
      return "String";
    case "TSNumberKeyword":
      return "Number";
    case "TSBooleanKeyword":
      return "Boolean";
    case "TSBigIntKeyword":
      return "BigInt";
    case "TSSymbolKeyword":
      return "Symbol";
    case "TSVoidKeyword":
    case "TSUndefinedKeyword":
    case "TSNullKeyword":
      return "void 0";
    case "TSArrayType":
    case "TSTupleType":
      return "Array";
    case "TSFunctionType":
    case "TSConstructorType":
      return "Function";
    case "TSParenthesizedType":
      return serializeTypeNode(node.typeAnnotation, declarations);
    case "TSTypeReference": {
      const name = identifierName(node.typeName);
      if (!name) return "Object";
      const decl = declarations.get(name);
      if (decl) {
        return decl.kind === "class" ? name : `__RFLCT_${name}`;
      }
      return name;
    }
    default:
      return "Object";
  }
}

function identifierName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  // qualified names: take the leftmost
  if (node.type === "TSQualifiedName") {
    const left = identifierName(node.left);
    return left ? `${left}.${node.right.name}` : null;
  }
  return null;
}

// Extracts the T from Reflect<T, M> — returns { type, metadata } or null.
export function extractReflectMarker(typeAnnotation) {
  if (!typeAnnotation) return null;
  const typeRef = typeAnnotation.typeAnnotation;
  if (!typeRef || typeRef.type !== "TSTypeReference") return null;
  if (!typeRef.typeName || typeRef.typeName.type !== "Identifier") return null;
  if (typeRef.typeName.name !== MARKER_NAME) return null;
  const params = typeRef.typeArguments?.params;
  if (!params || params.length === 0) return null;
  return { typeNode: params[0], metadataNode: params[1] ?? null };
}

// Serializes a type-level object literal to a runtime expression string.
// Handles: { key: "literal" | number | true/false }, nested objects, arrays.
export function serializeMetadataNode(node, source) {
  if (!node) return "{}";
  // For complex metadata, just extract the source text — it's already valid JS syntax
  // since type-level object literals mirror runtime object literals.
  return source.slice(node.start, node.end);
}
