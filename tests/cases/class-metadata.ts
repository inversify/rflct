import { Reflect, Reflectable } from "rflct";

type Injectable = Reflectable<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

class Service implements Injectable {
  constructor(logger: Reflect<Logger>) {}
}

class DirectMeta implements Reflectable<{ scope: 'transient' }> {
  constructor(name: Reflect<string>) {}
}

class BareImplements implements Reflectable {
  constructor() {}
}
