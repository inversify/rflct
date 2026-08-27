# Symbol Qualification

When RFLCT generates a `Symbol.for(...)` for an interface or type alias, the key
follows a deterministic format that prevents collisions across packages and files
while ensuring that the same type always resolves to the same symbol.

## Format

```
packageName@majorVersion|packageRelativePath|TypeName
```

**Example:** `@acme/shapes@1|src/geo.ts|Shape`

| Segment | Source | Example |
|---------|--------|---------|
| `packageName` | `name` field from nearest `package.json` | `@acme/shapes` |
| `majorVersion` | Major part of `version` from `package.json` | `1` |
| `packageRelativePath` | File path relative to the `package.json` directory | `src/geo.ts` |
| `TypeName` | The declared name of the interface or type alias | `Shape` |

## Why this format

### Package identity prevents collisions

Two packages can both declare an `interface Shape` without conflict — the
package name is part of the key:

```
@acme/shapes@1|src/geo.ts|Shape
@other/lib@2|src/types.ts|Shape
```

### Major-only versioning enables interop

Only the **major** version is included. This means `@acme/shapes@1.0.0` and
`@acme/shapes@1.3.5` produce the same symbol — they are assumed to be
API-compatible. A major version bump (`@acme/shapes@2.0.0`) produces a different
symbol, reflecting a potential breaking change.

### `Symbol.for()` ensures process-wide uniqueness

`Symbol.for(key)` returns the same symbol for the same key anywhere in the
process. This is critical for multi-package setups:

```
Package A depends on @acme/shapes@1.2.0
Package B depends on @acme/shapes@1.4.0
```

Both packages call `Symbol.for("@acme/shapes@1|src/geo.ts|Shape")` and get the
exact same symbol — so a `Shape` bound by Package A can be resolved by Package B.

If `Symbol()` (without `.for`) were used instead, each package would create a
distinct symbol and cross-package resolution would silently fail.

## How it is computed

The transformer calls `qualifiedName(fileName, typeName)` which:

1. Walks up from `fileName` to find the nearest `package.json`.
2. Reads `name` and `version` (extracting only the major segment).
3. Computes the file path relative to the `package.json` directory.
4. Joins: `${name}@${major}|${relativePath}|${typeName}`

If no `package.json` is found, the absolute file path is used as a fallback.

## Examples

| File | Type | Qualified name |
|------|------|----------------|
| `packages/shapes/src/geo.ts` | `Shape` | `@acme/shapes@1\|src/geo.ts\|Shape` |
| `packages/shapes/src/geo.ts` | `Corner` | `@acme/shapes@1\|src/geo.ts\|Corner` |
| `apps/web/src/services.ts` | `Logger` | `my-app@0\|src/services.ts\|Logger` |

## Related

- [Type-Only Symbols](./type-only-symbols.md) — how interfaces and type aliases
  become runtime identities
- [Resolve Calls](./resolve-calls.md) — using `resolve<T>()` to obtain a type's
  symbol in application code
