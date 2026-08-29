# Class-Level Metadata with `Reflectable`

`Reflectable<T>` is a phantom type used in `implements` clauses to attach
class-level metadata. The transformer detects it and emits a `design:class`
metadata call on the class itself.

## Basic usage

```ts
import { Reflect, Reflectable } from "rflct";

interface Logger {
  log(msg: string): void;
}

class Service implements Reflectable<{ scope: 'singleton' }> {
  constructor(logger: Reflect<Logger>) {}
}
```

### Transformed output

```js
const __RFLCT_Logger = Symbol.for("my-package@1|src/service.ts|Logger");

class Service {
  constructor(logger) {}
}

Reflect.defineMetadata("design:class", { scope: 'singleton' }, Service);
Reflect.defineMetadata("design:paramtypes", [
  { type: __RFLCT_Logger, metadata: {} }
], Service, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/service.ts|Logger": __RFLCT_Logger,
    "my-package@1|src/service.ts|Service": Service
  }
), Reflect);
```

## Type aliases for DRY patterns

You can create a type alias for `Reflectable<T>` to avoid repeating the
metadata object across many classes:

```ts
import { Reflect, Reflectable } from "rflct";

type Injectable = Reflectable<{ scope: 'singleton' }>;

class ServiceA implements Injectable {
  constructor(dep: Reflect<string>) {}
}

class ServiceB implements Injectable {
  constructor(dep: Reflect<number>) {}
}
```

Both `ServiceA` and `ServiceB` will have
`Reflect.defineMetadata("design:class", { scope: 'singleton' }, ...)` emitted.

## Bare `Reflectable` (no type argument)

If you use `Reflectable` without a type argument, empty metadata (`{}`)
is emitted:

```ts
class Minimal implements Reflectable {
  constructor() {}
}
```

Produces:

```js
Reflect.defineMetadata("design:class", {}, Minimal);
```

This is useful when you want to mark a class as "reflectable" without attaching
specific metadata.

## Auto-reflect for constructor parameters

When a class implements `Reflectable` (or an alias), all constructor
parameters are automatically reflected — no `Reflect<T>` annotation needed:

```ts
import { Reflectable } from "rflct";

interface Logger {
  log(msg: string): void;
}

class Service implements Reflectable<{ scope: 'singleton' }> {
  constructor(logger: Logger, retries: number) {}
}
```

### Transformed output

```js
const __RFLCT_Logger = Symbol.for("my-package@1|src/service.ts|Logger");

class Service {
  constructor(logger, retries) {}
}

Reflect.defineMetadata("design:class", { scope: 'singleton' }, Service);
Reflect.defineMetadata("design:paramtypes", [
  { type: __RFLCT_Logger, metadata: {} },
  { type: Number, metadata: {} }
], Service, undefined);
```

This drastically reduces verbosity for classes where every constructor parameter
is injected.

### Mixing auto-reflect with explicit `Reflect<T>`

If a parameter needs metadata (e.g. optionality), use `Reflect<T, M>` on that
parameter. Auto-reflected parameters get `metadata: {}`, while explicit
annotations take precedence:

```ts
import { Reflect, Reflectable } from "rflct";

class MixedService implements Reflectable {
  constructor(
    logger: Logger,                                    // auto: { type: ..., metadata: {} }
    cache: Reflect<Cache, { optional: true }>,         // explicit: { type: ..., metadata: { optional: true } }
  ) {}
}
```

### What auto-reflect covers

| Member | Auto-reflected? | Notes |
|--------|----------------|-------|
| Constructor parameters | ✅ Yes | All typed params get `design:paramtypes` |
| Properties | ❌ No | Use `Reflect<T>` — can't distinguish injected from internal state |
| Method parameters | ❌ No | Use `Reflect<T>` on individual params |

## Direct vs. aliased usage

Both forms work identically:

```ts
// Direct — metadata inline
class A implements Reflectable<{ scope: 'transient' }> {}

// Aliased — metadata in the type alias
type Transient = Reflectable<{ scope: 'transient' }>;
class B implements Transient {}
```

## Consuming class metadata at runtime

```ts
const meta = Reflect.getMetadata("design:class", Service);
// { scope: 'singleton' }

if (meta?.scope === 'singleton') {
  // register as singleton
}
```

## Related

- [Constructor Injection](./constructor-injection.md) — parameter-level metadata
- [Metadata Arguments](./metadata-arguments.md) — the metadata type parameter on
  `Reflect<T, M>`
- [Philosophy](./philosophy.md) — why `design:*` keys are used
