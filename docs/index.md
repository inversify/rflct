# Documentation

## Overview

- [Philosophy & Motivation](./philosophy.md) — Why RFLCT exists, the TC39 decorators story, and migration from `emitDecoratorMetadata`

## Use Cases

- [Constructor Injection](./constructor-injection.md) — `Reflect<T>` on constructor parameters
- [Property Injection](./property-injection.md) — `Reflect<T>` on class properties and `design:properties` registry
- [Method Parameters](./method-parameters.md) — `Reflect<T>` on method parameters
- [Resolve Calls](./resolve-calls.md) — `resolve<T>()` compile-time type resolution
- [Multi-Injection](./multi-injection.md) — `Reflect<T[]>` array types with `elementType`
- [Metadata Arguments](./metadata-arguments.md) — `Reflect<T, M>` custom metadata on parameters and properties
- [Class Metadata](./class-metadata.md) — `Reflectable<T>` class-level metadata via `implements`

## Internals

- [Type-Only Symbols](./type-only-symbols.md) — How interfaces and type aliases get `Symbol.for(...)` runtime identities
- [Symbol Qualification](./symbol-qualification.md) — The `package@major|path|Name` format and cross-package interop
- [Architecture](./internals.md) — How the transform pipeline works end-to-end
