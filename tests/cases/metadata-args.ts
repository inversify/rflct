import { Reflect } from "rflct";

interface Shape {
  sides: number;
}

class Polygon {
  constructor(
    shape: Reflect<Shape>,
    count: Reflect<number, { min: 3 }>
  ) {}
}
