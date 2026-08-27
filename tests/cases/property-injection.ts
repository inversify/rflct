import { Reflect } from "@remojansen/rflct";

interface Weapon {
  damage: number;
}

class Warrior {
  public weapon: Reflect<Weapon>;
  public name: Reflect<string, { optional: true }>;

  constructor(
    armor: Reflect<number>
  ) {}
}
