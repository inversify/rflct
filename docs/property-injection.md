# Property Injection

Annotate class properties with `Reflect<T>` to emit per-property type metadata
and a `design:properties` registry listing which properties carry metadata.

## Basic usage

```ts
import { Reflect } from "rflct";

interface Weapon {
  damage: number;
}

class Warrior {
  public weapon: Reflect<Weapon>;
  public name: Reflect<string, { optional: true }>;

  constructor(
    armor: Reflect<number>
  ) {}
}
```

### Transformed output

```js
const __RFLCT_Weapon = Symbol.for("my-package@1|src/warrior.ts|Weapon");

class Warrior {
  constructor(armor) {}
}

// List of properties that have metadata
Reflect.defineMetadata("design:properties", ["weapon", "name"], Warrior);

// Constructor parameter metadata
Reflect.defineMetadata("design:paramtypes", [
  { type: Number, metadata: {} }
], Warrior, undefined);

// Per-property type metadata (on the prototype, keyed by property name)
Reflect.defineMetadata("design:propertytype", [
  { type: String, metadata: { optional: true } }
], Warrior.prototype, "name");

Reflect.defineMetadata("design:propertytype", [
  { type: __RFLCT_Weapon, metadata: {} }
], Warrior.prototype, "weapon");

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/warrior.ts|Weapon": __RFLCT_Weapon,
    "my-package@1|src/warrior.ts|Warrior": Warrior
  }
), Reflect);
```

## What happens

1. The transformer detects `Reflect<T>` on class properties.
2. It emits `Reflect.defineMetadata("design:properties", [...names], ClassName)`
   listing every property that has a `Reflect<T>` annotation. This allows
   metadata consumers to discover injectable properties without scanning the
   prototype chain.
3. For each annotated property, it emits
   `Reflect.defineMetadata("design:propertytype", [...], ClassName.prototype, "propertyName")`
   with the type and metadata for that property.
4. Property metadata uses the **prototype** as target (`Warrior.prototype`) and
   the property name as key — matching the convention that decorator-based
   metadata uses for instance members.

## Combining constructor and property injection

Constructor parameters and property annotations coexist naturally. The
transformer emits separate metadata calls for each:

- **Constructor**: `design:paramtypes` — `target = ClassName`, `key = undefined`
- **Property**: `design:propertytype` — `target = ClassName.prototype`, `key = "propertyName"`

A DI container can read both to build a complete injection plan for a class.

## Interface-backed properties

When a property type is an interface or type alias (like `Weapon` above), the
transformer generates a `Symbol.for(...)` constant and uses it as the runtime
type. See [Type-Only Symbols](./type-only-symbols.md) for details on how
these symbols are qualified.

## Related

- [Constructor Injection](./constructor-injection.md) — metadata on constructor
  parameters
- [Method Parameters](./method-parameters.md) — metadata on method parameters
- [Type-Only Symbols](./type-only-symbols.md) — how interfaces become runtime
  identities
