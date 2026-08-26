

const __RFLCT_Shape = Symbol.for("rflct-tests@0|type-only-symbol.ts|Shape");
const __RFLCT_Corner = Symbol.for("rflct-tests@0|type-only-symbol.ts|Corner");
interface Shape {
  sides: number;
}

type Corner = { x: number; y: number };

class Polygon {
  constructor(
    public shape: Reflect<Shape>,
    public origin: Reflect<Corner>,
    public label: Reflect<string>
  ) {}
}
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Shape, metadata: {} }, { type: __RFLCT_Corner, metadata: {} }, { type: String, metadata: {} }], Polygon, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|type-only-symbol.ts|Shape": __RFLCT_Shape,
  "rflct-tests@0|type-only-symbol.ts|Corner": __RFLCT_Corner,
  "rflct-tests@0|type-only-symbol.ts|Polygon": Polygon
}), Reflect);
