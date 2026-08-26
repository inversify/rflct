import { Reflect } from "rflct";

interface Weapon {
  damage: number;
}

class Sword {}

class Warrior {
  constructor(
    weapons: Reflect<Weapon[], { multi: true }>,
    swords: Reflect<Sword[], { multi: true, chained: true }>
  ) {}
}
