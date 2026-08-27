# Method Parameters

Annotate method parameters with `Reflect<T>` to emit type metadata for
individual methods. This is useful for frameworks that need to inspect method
signatures — HTTP route handlers, RPC endpoints, event listeners, etc.

## Basic usage

```ts
import { Reflect } from "@remojansen/rflct";

export class Service {
  constructor(
    public label: Reflect<string>,
    public flag: Reflect<boolean>
  ) {}
}

class Internal {
  handle(req: Reflect<string>): void {}
}
```

### Transformed output

```js
export class Service {
  constructor(label, flag) {}
}

class Internal {
  handle(req) {}
}

// Method parameter metadata (on the prototype, keyed by method name)
Reflect.defineMetadata("design:paramtypes", [
  { type: String, metadata: {} }
], Internal.prototype, "handle");

Reflect.defineMetadata("design:symbols", Object.assign(
  Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
    "my-package@1|src/service.ts|Service": Service,
    "my-package@1|src/service.ts|Internal": Internal
  }
), Reflect);
```

## What happens

1. The transformer detects `Reflect<T>` on method parameters.
2. It emits `Reflect.defineMetadata("design:paramtypes", [...], ClassName.prototype, "methodName")`
   for each method that has at least one annotated parameter.
3. The target is `ClassName.prototype` and the key is the method name — the same
   convention that `emitDecoratorMetadata` used for instance methods.

## Selective annotation

Only parameters wrapped in `Reflect<T>` produce metadata. In the example above,
`Service` has constructor annotations (handled as
[constructor injection](./constructor-injection.md)) while `Internal.handle` has
a method parameter annotation. Classes without any `Reflect<T>` annotations
(like a plain `Untouched` class) are left completely alone.

## Exported vs. internal classes

Both exported and non-exported classes are registered in `design:symbols`. The
transformer preserves the `export` keyword on the symbol constant if the
original declaration was exported.

## Multiple methods

Multiple methods on the same class each get their own `design:paramtypes` call:

```ts
class Controller {
  getUser(id: Reflect<string>): void {}
  createUser(name: Reflect<string>, email: Reflect<string>): void {}
}
```

Produces:

```js
Reflect.defineMetadata("design:paramtypes", [
  { type: String, metadata: {} }
], Controller.prototype, "getUser");

Reflect.defineMetadata("design:paramtypes", [
  { type: String, metadata: {} },
  { type: String, metadata: {} }
], Controller.prototype, "createUser");
```

## Related

- [Constructor Injection](./constructor-injection.md) — metadata on constructor
  parameters
- [Property Injection](./property-injection.md) — metadata on class properties
- [Metadata Arguments](./metadata-arguments.md) — passing extra metadata with
  `Reflect<T, M>`
