import { Reflect, Reflectable } from "rflct";

type Injectable = Reflectable<{ scope: 'singleton' }>;

interface Logger {
  log(msg: string): void;
}

interface Config {
  port: number;
}

// Auto-reflect: no Reflect<T> needed on constructor params
class Service implements Injectable {
  config: Reflect<Config>;

  constructor(logger: Logger, port: number) {}
}

// Mixed: explicit Reflect<T> with metadata coexists with auto-reflected params
class MixedService implements Reflectable {
  constructor(logger: Reflect<Logger, { optional: true }>, name: string) {}
}

// Non-Reflectable class is unaffected
class Plain {
  constructor(x: string) {}
}
