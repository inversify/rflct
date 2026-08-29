

const __RFLCT_Config = Symbol.for("rflct-tests@0|auto-reflect.ts|Config");
const __RFLCT_Logger = Symbol.for("rflct-tests@0|auto-reflect.ts|Logger");
type Injectable = Reflectable<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

interface Config {
  port: number;
}

// Auto-reflect: no Reflect<T> needed on constructor params
class Service implements Injectable {
  config: Reflect<Config>;

  constructor(logger: Logger, port: number) {}
}

// Mixed: explicit Reflect<T> with metadata coexists with auto-reflected params
class MixedService implements Reflectable {
  constructor(logger: Reflect<Logger, { optional: true }>, name: string) {}
}

// Non-Reflectable class is unaffected
class Plain {
  constructor(x: string) {}
}
Reflect.defineMetadata("design:class", {}, MixedService);
Reflect.defineMetadata("design:class", { scope: 'singleton' }, Service);
Reflect.defineMetadata("design:properties", ["config"], Service);
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Logger, metadata: { optional: true } }, { type: String, metadata: {} }], MixedService, undefined);
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Logger, metadata: {} }, { type: Number, metadata: {} }], Service, undefined);
Reflect.defineMetadata("design:propertytype", [{ type: __RFLCT_Config, metadata: {} }], Service.prototype, "config");

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|auto-reflect.ts|Logger": __RFLCT_Logger,
  "rflct-tests@0|auto-reflect.ts|Config": __RFLCT_Config,
  "rflct-tests@0|auto-reflect.ts|Service": Service,
  "rflct-tests@0|auto-reflect.ts|MixedService": MixedService,
  "rflct-tests@0|auto-reflect.ts|Plain": Plain
}), Reflect);
