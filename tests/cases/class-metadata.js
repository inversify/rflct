

const __RFLCT_Logger = Symbol.for("rflct-tests@0|class-metadata.ts|Logger");
type Injectable = WithReflectMetadata<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

class Service implements Injectable {
  constructor(logger: Reflect<Logger>) {}
}
Reflect.defineMetadata("design:class", { scope: 'singleton' }, Service);
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Logger, metadata: {} }], Service, undefined);

class DirectMeta implements WithReflectMetadata<{ scope: 'transient' }> {
  constructor(name: Reflect<string>) {}
}
Reflect.defineMetadata("design:class", { scope: 'transient' }, DirectMeta);
Reflect.defineMetadata("design:paramtypes", [{ type: String, metadata: {} }], DirectMeta, undefined);

class BareImplements implements WithReflectMetadata {
  constructor() {}
}
Reflect.defineMetadata("design:class", {}, BareImplements);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|class-metadata.ts|Injectable": __RFLCT_Injectable,
  "rflct-tests@0|class-metadata.ts|Logger": __RFLCT_Logger,
  "rflct-tests@0|class-metadata.ts|Service": Service,
  "rflct-tests@0|class-metadata.ts|DirectMeta": DirectMeta,
  "rflct-tests@0|class-metadata.ts|BareImplements": BareImplements
}), Reflect);
