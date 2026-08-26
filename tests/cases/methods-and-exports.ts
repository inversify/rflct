import { Reflect } from "rflct";

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
