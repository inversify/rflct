import { Reflect, resolve } from "rflct";

interface Shape {
  sides: number;
}

class Polygon implements Shape {
  sides = 3;
  constructor(public s: Reflect<number>) {}
}

const shapeId = resolve<Shape>();
const polyId = resolve<Polygon>(Polygon);
