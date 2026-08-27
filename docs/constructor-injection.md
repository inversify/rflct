# Constructor Injection

Annotate constructor parameters with `Reflect<T>` to emit type metadata at build
time. This is the most common use case — a DI container reads the metadata to
know what to inject.

## Basic usage

```ts
import { Reflect } from "rflct";

class Demo {
  constructor(
    public name: Reflect<string>,
    public age: Reflect<number>,
    public phone?: Reflect<number, { optional: true }>
  ) {}
}
```

### Transformed output

```js
class Demo {
  constructor(name, age, phone) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: String, metadata: {} },
  { type: Number, metadata: {} },
  { type: Number, metadata: { optional: true } }
], Demo, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/demo.ts|Demo": Demo
  }
), Reflect);
```

## What happens

1. The RFLCT transformer sees each `Reflect<T>` annotation on constructor
   parameters.
2. It emits a single `Reflect.defineMetadata("design:paramtypes", [...], Demo, undefined)`
   call after the class declaration. The fourth argument is `undefined` because
   this is constructor metadata (no property key).
3. Each entry in the array is `{ type, metadata }`:
   - `type` is the runtime representation of `T` — `String`, `Number`,
     `Boolean` for primitives, or `Symbol.for(...)` for interfaces/type aliases.
   - `metadata` is the second type argument of `Reflect<T, M>`, defaulting to
     `{}`.
4. The class is also registered in `design:symbols` so it can be discovered at
   runtime.

## Type mapping

| TypeScript type | Runtime value |
|----------------|---------------|
| `string` | `String` |
| `number` | `Number` |
| `boolean` | `Boolean` |
| `bigint` | `BigInt` |
| `symbol` | `Symbol` |
| `void`, `undefined`, `null` | `void 0` |
| `T[]`, tuples | `Array` |
| Function types | `Function` |
| Class `Foo` | `Foo` (constructor reference) |
| Interface / type alias | `Symbol.for("qualified|name")` |

## Optional metadata

The second type argument of `Reflect<T, M>` carries arbitrary metadata alongside
the type. This is useful for signaling optionality, default values, or
framework-specific configuration:

```ts
constructor(
  db: Reflect<Database>,                         // { type: Database, metadata: {} }
  logger: Reflect<Logger, { optional: true }>,   // { type: ..., metadata: { optional: true } }
  count: Reflect<number, { min: 1, max: 100 }>   // { type: Number, metadata: { min: 1, max: 100 } }
) {}
```

See [Metadata Arguments](./metadata-arguments.md) for more detail on the
metadata type parameter.

## Related

- [Property Injection](./property-injection.md) — metadata on class properties
- [Method Parameters](./method-parameters.md) — metadata on method parameters
- [Type-Only Symbols](./type-only-symbols.md) — how interfaces and type aliases
  become runtime identities
