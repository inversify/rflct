

export class Service {
  constructor(
    public label: Reflect<string>,
    public flag: Reflect<boolean>
  ) {}
}

export class Untouched {
  constructor(public plain: string) {}
}

class Internal {
  handle(req: Reflect<string>): void {}
}
Reflect.defineMetadata("design:paramtypes", [{ type: String, metadata: {} }], Internal.prototype, "handle");

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|methods-and-exports.ts|Service": Service,
  "rflct-tests@0|methods-and-exports.ts|Untouched": Untouched,
  "rflct-tests@0|methods-and-exports.ts|Internal": Internal
}), Reflect);
