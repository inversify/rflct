/* eslint-disable @typescript-eslint/no-explicit-any */

export const MARKER_NAME = 'Reflect';
export const RESOLVE_NAME = 'resolve';
export const WITH_REFLECT_METADATA_NAME = 'Reflectable';
export const PACKAGE_NAMES: string[] = ['rflct', 'rflct'];

export interface DeclInfo {
  kind: string;
  name: string;
  exported: boolean;
  end: number;
  topLevel?: boolean;
}

export interface ParamEntry {
  type: string;
  metadata: string;
  elementType?: string;
}

export interface ReflectionInfo {
  className: string;
  // null = constructor, string = method or property name
  methodName: string | null;
  // For computed property keys (e.g., [symbol]), stores the raw expression
  computedKey?: string;
  params: ParamEntry[];
  insertAfter: number;
  isProperty?: boolean;
  // true when the reflection originates from a PropertyDefinition (for design:properties)
  fromPropertyDefinition?: boolean;
}

export interface ResolveCallInfo {
  start: number;
  end: number;
  replacement: string;
}

export interface ClassMetadataInfo {
  className: string;
  metadataExpr: string;
  insertAfter: number;
}

export interface Edit {
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
  // Additional names treated as Reflectable markers (e.g. ['Injectable'])
  classMetadataAliases?: string[];
  // Additional import source patterns to treat as rflct sources
  importSources?: RegExp;
  // When true, strip TypeScript types from output (via oxc-transform) so downstream plugins only see JS
  transpile?: boolean;
}

export interface TransformResult {
  code: string;
  transformed: boolean;
  map?: string;
}
