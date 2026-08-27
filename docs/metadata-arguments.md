# Metadata Arguments

The second type parameter of `Reflect<T, M>` lets you attach arbitrary metadata
to any parameter or property annotation. The metadata object is serialized
verbatim into the transformed output.

## Basic usage

```ts
import { Reflect } from "rflct";

interface Shape {
  sides: number;
}

class Polygon {
  constructor(
    shape: Reflect<Shape>,
    count: Reflect<number, { min: 3 }>
  ) {}
}
```

### Transformed output

```js
const __RFLCT_Shape = Symbol.for("my-package@1|src/polygon.ts|Shape");

class Polygon {
  constructor(shape, count) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: __RFLCT_Shape, metadata: {} },
  { type: Number, metadata: { min: 3 } }
], Polygon, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/polygon.ts|Shape": __RFLCT_Shape,
    "my-package@1|src/polygon.ts|Polygon": Polygon
  }
), Reflect);
```

## How it works

`Reflect<T>` is defined as `Reflect<T, Metadata = {}>`. The second type argument
defaults to `{}` when omitted:

- `Reflect<string>` → `{ type: String, metadata: {} }`
- `Reflect<string, { optional: true }>` → `{ type: String, metadata: { optional: true } }`
- `Reflect<number, { min: 3 }>` → `{ type: Number, metadata: { min: 3 } }`

The metadata object is extracted from the type annotation at compile time and
serialized directly into the output JavaScript. Only object literal types are
supported — you cannot use variables, expressions, or complex type computations.

## Common patterns

### Optionality

```ts
constructor(
  required: Reflect<Database>,
  optional: Reflect<Logger, { optional: true }>
) {}
```

### Validation constraints

```ts
constructor(
  name: Reflect<string, { minLength: 1, maxLength: 255 }>,
  age: Reflect<number, { min: 0, max: 150 }>
) {}
```

### Named bindings

```ts
constructor(
  primary: Reflect<Database, { name: "primary" }>,
  replica: Reflect<Database, { name: "replica" }>
) {}
```

### Multi-injection flags

```ts
constructor(
  plugins: Reflect<Plugin[], { multi: true }>
) {}
```

See [Multi-Injection](./multi-injection.md) for details on array types.

## Consuming metadata at runtime

```ts
const paramTypes = Reflect.getMetadata("design:paramtypes", Polygon);
// [
//   { type: Symbol.for("...Shape"), metadata: {} },
//   { type: Number, metadata: { min: 3 } }
// ]

for (const entry of paramTypes) {
  if (entry.metadata.optional) {
    // handle optional injection
  }
  if (entry.metadata.min !== undefined) {
    // handle validation
  }
}
```

## Related

- [Constructor Injection](./constructor-injection.md) — basic constructor
  parameter metadata
- [Property Injection](./property-injection.md) — metadata on class properties
- [Multi-Injection](./multi-injection.md) — array types with `elementType`
