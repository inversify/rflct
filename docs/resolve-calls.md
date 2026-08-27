# Compile-Time Type Resolution with `resolve<T>()`

`resolve<T>()` lets you obtain the runtime identity of any type at compile time.
The transformer replaces each call with the concrete value — no runtime dispatch,
no string lookups.

## Basic usage

```ts
import { Reflect, resolve } from "@remojansen/rflct";

interface Shape {
  sides: number;
}

class Polygon implements Shape {
  sides = 3;
  constructor(public s: Reflect<number>) {}
}

const shapeId = resolve<Shape>();
const polyId = resolve<Polygon>(Polygon);
```

### Transformed output

```js
const __RFLCT_Shape = Symbol.for("my-package@1|src/geo.ts|Shape");

class Polygon {
  sides = 3;
  constructor(s) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: Number, metadata: {} }
], Polygon, undefined);

// resolve<Shape>() → Symbol.for(...)
const shapeId = __RFLCT_Shape;

// resolve<Polygon>(Polygon) → Polygon (pass-through)
const polyId = Polygon;

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/geo.ts|Shape": __RFLCT_Shape,
    "my-package@1|src/geo.ts|Polygon": Polygon
  }
), Reflect);
```

## How it works

| Call form | Type argument | Replacement |
|-----------|--------------|-------------|
| `resolve<Shape>()` | Interface / type alias | `Symbol.for("qualified\|name")` |
| `resolve<Polygon>(Polygon)` | Class | `Polygon` (the constructor) |

- **Interfaces and type aliases** don't exist at runtime, so `resolve<T>()`
  returns a `Symbol.for(...)` with a deterministic qualified name. Two packages
  that independently call `resolve<Shape>()` for the same `Shape` from the same
  source package will get the same symbol.
- **Classes** already have a runtime identity (the constructor function), so
  `resolve<T>(T)` is a pass-through — it returns the class itself. You pass the
  class as an argument to help the transformer confirm it's dealing with a class.

## Use cases

### DI container bindings

```ts
container.bind(resolve<Logger>()).to(ConsoleLogger);
container.bind(resolve<Database>(Database)).toSelf();
```

### Map keys

```ts
const handlers = new Map<symbol, Handler>();
handlers.set(resolve<UserCreated>(), handleUserCreated);
handlers.set(resolve<OrderPlaced>(), handleOrderPlaced);
```

### Service locator patterns

```ts
const logger = container.get(resolve<Logger>());
```

## Runtime safety

If the build plugin is not configured and `resolve<T>()` is called at runtime
without being transformed, it throws an error:

```
rflct: `resolve<T>()` was called but never replaced at compile time.
Ensure the build plugin is configured (unplugin for Vite/Rollup/webpack,
or the CLI for tsgo).
```

This fail-fast behavior prevents silent bugs where type resolution silently
returns `undefined`.

## Related

- [Type-Only Symbols](./type-only-symbols.md) — how interfaces and type aliases
  get stable runtime identities
- [Symbol Qualification](./symbol-qualification.md) — how qualified names are
  constructed
- [Constructor Injection](./constructor-injection.md) — annotating constructor
  parameters with `Reflect<T>`
