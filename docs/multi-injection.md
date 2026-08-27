# Multi-Injection (Array Types)

When a parameter or property type is an array (`T[]`), the transformer emits an
`elementType` field alongside the `type` and `metadata`. This enables DI
containers to inject all bindings for the element type as a collection.

## Basic usage

```ts
import { Reflect } from "rflct";

interface Weapon {
  damage: number;
}

class Sword {}

class Warrior {
  constructor(
    weapons: Reflect<Weapon[], { multi: true }>,
    swords: Reflect<Sword[], { multi: true, chained: true }>
  ) {}
}
```

### Transformed output

```js
const __RFLCT_Weapon = Symbol.for("my-package@1|src/warrior.ts|Weapon");

class Sword {}

class Warrior {
  constructor(weapons, swords) {}
}

Reflect.defineMetadata("design:paramtypes", [
  { type: Array, metadata: { multi: true }, elementType: __RFLCT_Weapon },
  { type: Array, metadata: { multi: true, chained: true }, elementType: Sword }
], Warrior, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/warrior.ts|Weapon": __RFLCT_Weapon,
    "my-package@1|src/warrior.ts|Sword": Sword,
    "my-package@1|src/warrior.ts|Warrior": Warrior
  }
), Reflect);
```

## What happens

1. When the annotated type is `T[]`, the `type` field becomes `Array`.
2. An additional `elementType` field is emitted with the runtime identity of `T`:
   - `Weapon` (interface) → `Symbol.for("...")`
   - `Sword` (class) → `Sword` (constructor reference)
3. The `metadata` object is preserved as-is — `{ multi: true }` in this case.

## Metadata entry shape

```ts
{
  type: Array,              // always Array for T[]
  metadata: { multi: true },  // your custom metadata
  elementType: __RFLCT_Weapon  // runtime identity of T
}
```

The `elementType` field is only present for array types. For non-array types,
entries have only `type` and `metadata`.

## Use with DI containers

A DI container can detect multi-injection by checking for the `elementType`
field:

```ts
const paramTypes = Reflect.getMetadata("design:paramtypes", Warrior);
for (const entry of paramTypes) {
  if (entry.elementType) {
    // Resolve all bindings for entry.elementType and inject as array
    const all = container.getAll(entry.elementType);
    // ...
  } else {
    // Resolve single binding for entry.type
    const one = container.get(entry.type);
    // ...
  }
}
```

## Related

- [Constructor Injection](./constructor-injection.md) — basic constructor
  parameter metadata
- [Metadata Arguments](./metadata-arguments.md) — the second type parameter of
  `Reflect<T, M>`
- [Type-Only Symbols](./type-only-symbols.md) — how `Weapon` becomes a
  `Symbol.for(...)` at runtime
