import { Reflect } from "rflct";

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
