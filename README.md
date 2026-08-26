# 🪞 RFLCT

Ahead-of-time reflect metadata for TypeScript 7. Injects `design:symbols` and
`design:arguments` at build time — no decorators, no `emitDecoratorMetadata`.

Integrates with any build tool via [unplugin](https://github.com/unjs/unplugin)
(Vite, Rollup, webpack, esbuild), or use the CLI with the TypeScript 7 API for
standalone `tsgo` projects.

## Quick example

```ts
import { Reflect, resolve } from "rflct";

interface Shape { sides: number; }

class Polygon {
  constructor(
    public shape: Reflect<Shape>,
    public label: Reflect<string, { optional: true }>
  ) {}
}

// resolve<T>() → the runtime identity of T (Symbol for interfaces, class for classes)
container.bind(resolve<Shape>()).to(Polygon);
```

After transformation:

```js
import "reflect-metadata";

const __RFLCT_Shape = Symbol.for("@acme/shapes@1|src/geo.ts|Shape");

class Polygon {
  constructor(shape, label) {}
}

Reflect.defineMetadata("design:arguments", [
  { type: __RFLCT_Shape, metadata: {} },
  { type: String, metadata: { optional: true } }
], Polygon, undefined);

container.bind(__RFLCT_Shape).to(Polygon);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "@acme/shapes@1|src/geo.ts|Shape": __RFLCT_Shape,
    "@acme/shapes@1|src/geo.ts|Polygon": Polygon,
  }
), Reflect);
```

## Three transformations

### 1. `design:symbols` — global type registry

Every class, interface, and type alias in a file is registered in a process-wide
Map on `Reflect`. Interfaces/types become `Symbol.for(qualifiedName)`, classes
map to their constructor.

### 2. `design:arguments` — parameter type metadata

Parameters annotated with `Reflect<T>` (or `Reflect<T, Metadata>`) produce a
`Reflect.defineMetadata("design:arguments", [...], target, key)` call:

- **Constructor**: target = `ClassName`, key = `undefined`
- **Method**: target = `ClassName.prototype`, key = `"methodName"`

Each entry is `{ type, metadata }` where metadata is the second type argument
(defaults to `{}`).

### 3. `resolve<T>()` — compile-time type resolution

`resolve<T>()` is replaced at compile time with the runtime identity of `T`:

- `resolve<Shape>()` → `Symbol.for("...Shape")` (interface/type → Symbol)
- `resolve<Triangle>(Triangle)` → `Triangle` (class → itself)

Works anywhere in source code — DI bindings, map keys, switch targets, etc.

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

## Symbol qualification

Generated symbols use `Symbol.for(qualifiedName)` where the key is:

```
packageName@majorVersion|packageRelativePath|TypeName
```

For example: `@acme/shapes@1|src/geo.ts|Shape`

- **Package identity** prevents collisions between independently built packages.
- **Major-only versioning** means patch/minor releases share symbols and interoperate.
- **`Symbol.for`** (not `Symbol()`) ensures two packages depending on the same
  shared library resolve to the same symbol.

## API

### Types (imported by consumers)

```ts
// Marks a parameter for metadata injection. Erases to T.
type Reflect<T, Metadata = {}> = T;

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
