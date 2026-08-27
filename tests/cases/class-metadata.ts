import { Reflect, WithReflectMetadata } from "rflct";

type Injectable = WithReflectMetadata<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

class Service implements Injectable {
  constructor(logger: Reflect<Logger>) {}
}

class DirectMeta implements WithReflectMetadata<{ scope: 'transient' }> {
  constructor(name: Reflect<string>) {}
}

class BareImplements implements WithReflectMetadata {
  constructor() {}
}
