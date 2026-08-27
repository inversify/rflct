# 🪞 RFLCT: Runtime type metadata in TS 7.0+ No `--emitDecoratorMetadata` or decorators required

Ahead-of-time reflect metadata for TypeScript 7. Injects `design:symbols`,
`design:paramtypes`, `design:properties`, and `design:class` at build time — no
decorators, no `emitDecoratorMetadata`.

Integrates with any build tool via [unplugin](https://github.com/unjs/unplugin)
(Vite, Rollup, webpack, esbuild), or use the CLI with the TypeScript 7 API for
standalone `tsgo` projects.

> **Why does this exist?** TC39 decorators are now standard, but
> `emitDecoratorMetadata` was never part of the spec and is being removed. RFLCT
> fills the gap by emitting type metadata from type annotations at compile time,
> using the same `reflect-metadata` runtime and `design:*` keys that the
> ecosystem already understands. Read the full
> [Philosophy & Motivation](docs/philosophy.md).

## Quick example

```ts
import { Reflect, resolve } from "rflct";

interface Shape { sides: number; }

class Polygon {
  public color: Reflect<string, { optional: true }>;

  constructor(
    public shape: Reflect<Shape>,
    public label: Reflect<string>
  ) {}
}

container.bind(resolve<Shape>()).to(Polygon);
```

After transformation:

```js
const __RFLCT_Shape = Symbol.for("@acme/shapes@1|src/geo.ts|Shape");

class Polygon {
  constructor(shape, label) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: __RFLCT_Shape, metadata: {} },
  { type: String, metadata: {} }
], Polygon, undefined);

Reflect.defineMetadata("design:properties", ["color"], Polygon);
Reflect.defineMetadata("design:paramtypes", [
  { type: String, metadata: { optional: true } }
], Polygon.prototype, "color");

container.bind(__RFLCT_Shape).to(Polygon);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "@acme/shapes@1|src/geo.ts|Shape": __RFLCT_Shape,
    "@acme/shapes@1|src/geo.ts|Polygon": Polygon,
  }
), Reflect);
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Philosophy & Motivation](docs/philosophy.md) | Why RFLCT exists — TC39 decorators, `emitDecoratorMetadata` removal, and migration strategy |
| [Constructor Injection](docs/constructor-injection.md) | `Reflect<T>` on constructor parameters — type mapping, optional metadata |
| [Property Injection](docs/property-injection.md) | `Reflect<T>` on class properties — `design:properties` registry, per-property metadata |
| [Method Parameters](docs/method-parameters.md) | `Reflect<T>` on method parameters — prototype-level metadata |
| [Resolve Calls](docs/resolve-calls.md) | `resolve<T>()` — compile-time type resolution for DI bindings and map keys |
| [Multi-Injection](docs/multi-injection.md) | `Reflect<T[]>` — array types with `elementType` for injecting collections |
| [Metadata Arguments](docs/metadata-arguments.md) | `Reflect<T, M>` — attaching arbitrary metadata (optionality, constraints, names) |
| [Class Metadata](docs/class-metadata.md) | `WithReflectMetadata<T>` — class-level metadata via `implements` clauses |
| [Type-Only Symbols](docs/type-only-symbols.md) | How interfaces and type aliases get stable `Symbol.for(...)` runtime identities |
| [Symbol Qualification](docs/symbol-qualification.md) | The `package@major\|path\|Name` format and cross-package interop guarantees |

## Four transformations

| # | Metadata key | What it does |
|---|-------------|--------------|
| 1 | `design:symbols` | Global type registry — every class, interface, and type alias is registered process-wide |
| 2 | `design:paramtypes` | Parameter and property type metadata — `{ type, metadata }` entries for constructors, methods, and properties |
| 3 | `design:properties` | Property name registry — lists which properties on a class carry `Reflect<T>` annotations |
| 4 | `design:class` | Class-level metadata via `WithReflectMetadata<T>` in `implements` clauses |

`resolve<T>()` is a fifth transformation that replaces calls with the runtime
identity of `T` at compile time.

## Installation

```bash
npm install rflct reflect-metadata
```

Import `reflect-metadata` once at your application entry point:

```ts
import "reflect-metadata";
```

This polyfills the global `Reflect.defineMetadata` / `Reflect.getMetadata` API
that the generated code relies on. Do **not** import it in every file — a single
import per process is sufficient.

## Usage with build tools (unplugin)

### Vite

```js
// vite.config.js
import { vitePlugin } from "rflct/vite";

export default {
  plugins: [vitePlugin()],
};
```

### Rollup

```js
// rollup.config.js
import { rollupPlugin } from "rflct/rollup";

export default {
  plugins: [rollupPlugin()],
};
```

### webpack

```js
// webpack.config.js
const { webpackPlugin } = require("rflct/webpack");

module.exports = {
  plugins: [webpackPlugin()],
};
```

### esbuild

```js
import { esbuildPlugin } from "rflct/esbuild";

await esbuild.build({
  plugins: [esbuildPlugin()],
});
```

## Usage with TypeScript 7 CLI

For standalone `tsgo` projects without a bundler:

```bash
npx rflct -p tsconfig.json -o dist
```

Options:
- `-p, --project` — path to tsconfig.json (default: `tsconfig.json`)
- `-o, --outDir` — output directory for transformed files
- `--check` — type-check the transformed output via the TS7 API

The CLI uses the TypeScript 7 API (`typescript/unstable/sync`) to load the
program, resolve types via the checker, and optionally validate the result
through VFS overlays.

## API

### Types (imported by consumers)

```ts
// Marks a parameter/property for metadata injection. Erases to T.
type Reflect<T, Metadata = {}> = T;

// Phantom type for class-level metadata via implements clauses.
type WithReflectMetadata<T = {}> = { ... };

// Compile-time resolution — replaced by the transformer.
function resolve<T>(value?: new (...args: any[]) => T): symbol | (new (...args: any[]) => T);
```

### Programmatic transform

```js
import { transform } from "rflct/transform";

const result = transform(source, fileName);
// result.code — transformed source (still TypeScript, ready for type-stripping)
// result.transformed — whether any changes were made
```

## License

MIT
