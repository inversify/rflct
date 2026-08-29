/**
 * Marks a parameter for metadata injection. In type position it is transparently `T`.
 * The transformer reads the annotation and injects `design:paramtypes` metadata.
 *
 * `Metadata` is an optional object type carried alongside the type info.
 *
 * ```ts
 * class Service {
 *     constructor(dep: Reflect<Shape>, flag: Reflect<boolean, { optional: true }>) {}
 * }
 * ```
 */
export type Reflect<T, Metadata = {}> = T;

/**
 * Phantom type for class-level metadata via `implements` clauses.
 * The transformer detects this in the implements list, extracts `T`,
 * and emits `Reflect.defineMetadata("design:class", T, ClassName)`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type Reflectable<T = {}> = { readonly __rflct?: T; constructor: Function };

/**
 * Compile-time resolution of a type's runtime identity.
 *
 * - For classes: `resolve<MyClass>(MyClass)` → `MyClass` (pass-through)
 * - For interfaces/types: `resolve<Shape>()` → `Symbol.for("qualified|name")`
 *
 * The transformer replaces every `resolve<T>()` call at compile time.
 * If the transformer did not run, calling this throws at runtime.
 */
export declare function resolve<T>(value?: abstract new (...args: any[]) => T): symbol | (abstract new (...args: any[]) => T);
