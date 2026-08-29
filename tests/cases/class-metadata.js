

const __RFLCT_Logger = Symbol.for("rflct-tests@0|class-metadata.ts|Logger");
type Injectable = Reflectable<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

class Service implements Injectable {
  constructor(logger: Reflect<Logger>) {}
}

class DirectMeta implements Reflectable<{ scope: 'transient' }> {
  constructor(name: Reflect<string>) {}
}

class BareImplements implements Reflectable {
  constructor() {}
}
Reflect.defineMetadata("design:class", {}, BareImplements);
Reflect.defineMetadata("design:class", { scope: 'transient' }, DirectMeta);
Reflect.defineMetadata("design:class", { scope: 'singleton' }, Service);
Reflect.defineMetadata("design:paramtypes", [{ type: String, metadata: {} }], DirectMeta, undefined);
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Logger, metadata: {} }], Service, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|class-metadata.ts|Logger": __RFLCT_Logger,
  "rflct-tests@0|class-metadata.ts|Service": Service,
  "rflct-tests@0|class-metadata.ts|DirectMeta": DirectMeta,
  "rflct-tests@0|class-metadata.ts|BareImplements": BareImplements
}), Reflect);
