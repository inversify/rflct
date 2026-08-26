

const __RFLCT_Shape = Symbol.for("rflct-tests@0|resolve-calls.ts|Shape");
interface Shape {
  sides: number;
}

class Polygon implements Shape {
  sides = 3;
  constructor(public s: Reflect<number>) {}
}
Reflect.defineMetadata("design:paramtypes", [{ type: Number, metadata: {} }], Polygon, undefined);

const shapeId = __RFLCT_Shape;
const polyId = Polygon;

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|resolve-calls.ts|Shape": __RFLCT_Shape,
  "rflct-tests@0|resolve-calls.ts|Polygon": Polygon
}), Reflect);
