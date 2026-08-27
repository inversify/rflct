# Class-Level Metadata with `WithReflectMetadata`

`WithReflectMetadata<T>` is a phantom type used in `implements` clauses to attach
class-level metadata. The transformer detects it and emits a `design:class`
metadata call on the class itself.

## Basic usage

```ts
import { Reflect, WithReflectMetadata } from "rflct";

interface Logger {
  log(msg: string): void;
}

class Service implements WithReflectMetadata<{ scope: 'singleton' }> {
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

You can create a type alias for `WithReflectMetadata<T>` to avoid repeating the
metadata object across many classes:

```ts
import { Reflect, WithReflectMetadata } from "rflct";

type Injectable = WithReflectMetadata<{ scope: 'singleton' }>;

class ServiceA implements Injectable {
  constructor(dep: Reflect<string>) {}
}

class ServiceB implements Injectable {
  constructor(dep: Reflect<number>) {}
}
```

Both `ServiceA` and `ServiceB` will have
`Reflect.defineMetadata("design:class", { scope: 'singleton' }, ...)` emitted.

## Bare `WithReflectMetadata` (no type argument)

If you use `WithReflectMetadata` without a type argument, empty metadata (`{}`)
is emitted:

```ts
class Minimal implements WithReflectMetadata {
  constructor() {}
}
```

Produces:

```js
Reflect.defineMetadata("design:class", {}, Minimal);
```

This is useful when you want to mark a class as "reflectable" without attaching
specific metadata.

## Direct vs. aliased usage

Both forms work identically:

```ts
// Direct — metadata inline
class A implements WithReflectMetadata<{ scope: 'transient' }> {}

// Aliased — metadata in the type alias
type Transient = WithReflectMetadata<{ scope: 'transient' }>;
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
