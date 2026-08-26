

const __RFLCT_Shape = Symbol.for("rflct-tests@0|metadata-args.ts|Shape");
interface Shape {
  sides: number;
}

class Polygon {
  constructor(
    shape: Reflect<Shape>,
    count: Reflect<number, { min: 3 }>
  ) {}
}
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Shape, metadata: {} }, { type: Number, metadata: { min: 3 } }], Polygon, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|metadata-args.ts|Shape": __RFLCT_Shape,
  "rflct-tests@0|metadata-args.ts|Polygon": Polygon
}), Reflect);
