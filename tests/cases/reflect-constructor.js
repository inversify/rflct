

class Demo {
  constructor(
    public name: Reflect<string>,
    public age: Reflect<number>,
    public phone?: Reflect<number, { optional: true }>
  ) {}
}
Reflect.defineMetadata("design:paramtypes", [{ type: String, metadata: {} }, { type: Number, metadata: {} }, { type: Number, metadata: { optional: true } }], Demo, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|reflect-constructor.ts|Demo": Demo
}), Reflect);
