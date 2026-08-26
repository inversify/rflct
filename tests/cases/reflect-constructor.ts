import { Reflect } from "rflct";

class Demo {
  constructor(
    public name: Reflect<string>,
    public age: Reflect<number>,
    public phone?: Reflect<number, { optional: true }>
  ) {}
}
