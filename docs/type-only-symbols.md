# Type-Only Symbols

Interfaces and type aliases don't exist at runtime in JavaScript. RFLCT gives
them stable runtime identities by generating `Symbol.for(qualifiedName)`
constants at build time.

## Basic usage

```ts
import { Reflect } from "@remojansen/rflct";

interface Shape {
  sides: number;
}

type Corner = { x: number; y: number };

class Polygon {
  constructor(
    public shape: Reflect<Shape>,
    public origin: Reflect<Corner>,
    public label: Reflect<string>
  ) {}
}
```

### Transformed output

```js
const __RFLCT_Shape = Symbol.for("my-package@1|src/geo.ts|Shape");
const __RFLCT_Corner = Symbol.for("my-package@1|src/geo.ts|Corner");

class Polygon {
  constructor(shape, origin, label) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: __RFLCT_Shape, metadata: {} },
  { type: __RFLCT_Corner, metadata: {} },
  { type: String, metadata: {} }
], Polygon, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/geo.ts|Shape": __RFLCT_Shape,
    "my-package@1|src/geo.ts|Corner": __RFLCT_Corner,
    "my-package@1|src/geo.ts|Polygon": Polygon
  }
), Reflect);
```

## How it works

1. When the transformer encounters a `Reflect<T>` where `T` is an interface or
   type alias (not a class), it generates a `const __RFLCT_Name = Symbol.for(...)`
   declaration at the top of the file.
2. The `Symbol.for(qualifiedName)` call uses a deterministic key based on the
   package name, major version, file path, and type name. See
   [Symbol Qualification](./symbol-qualification.md) for the format.
3. `Symbol.for()` (not `Symbol()`) is used deliberately — it creates a
   **global** symbol that is shared across the entire process. Two different
   packages that reference the same `Shape` interface from the same source will
   get the exact same symbol.

## Classes vs. interfaces vs. type aliases

| Declaration | Runtime identity | `design:symbols` value |
|------------|------------------|----------------------|
| `class Foo` | `Foo` (constructor) | `Foo` |
| `interface Bar` | `Symbol.for("...Bar")` | `__RFLCT_Bar` |
| `type Baz = {...}` | `Symbol.for("...Baz")` | `__RFLCT_Baz` |

Classes already have a runtime identity — they are constructor functions. The
transformer uses the class constructor directly. Only interfaces and type aliases
need synthesized symbols.

## The `design:symbols` registry

Every class, interface, and type alias in a transformed file is registered in the
global `design:symbols` map on `Reflect`. This is a process-wide registry that
maps qualified names to their runtime identities:

```ts
const symbols = Reflect.getMetadata("design:symbols", Reflect);
// {
//   "my-package@1|src/geo.ts|Shape": Symbol.for("my-package@1|src/geo.ts|Shape"),
//   "my-package@1|src/geo.ts|Corner": Symbol.for("my-package@1|src/geo.ts|Corner"),
//   "my-package@1|src/geo.ts|Polygon": [class Polygon]
// }
```

This enables runtime discovery — a framework can iterate the registry to find
all known types, or look up a type by its qualified name.

## Related

- [Symbol Qualification](./symbol-qualification.md) — how the qualified name
  string is constructed
- [Resolve Calls](./resolve-calls.md) — using `resolve<T>()` to get a type's
  runtime identity in application code
- [Constructor Injection](./constructor-injection.md) — how type identities
  appear in `design:paramtypes`
