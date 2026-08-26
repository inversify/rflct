

const __RFLCT_Weapon = Symbol.for("rflct-tests@0|multi-inject.ts|Weapon");
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
Reflect.defineMetadata("design:paramtypes", [{ type: Array, metadata: { multi: true }, elementType: __RFLCT_Weapon }, { type: Array, metadata: { multi: true, chained: true }, elementType: Sword }], Warrior, undefined);

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|multi-inject.ts|Weapon": __RFLCT_Weapon,
  "rflct-tests@0|multi-inject.ts|Sword": Sword,
  "rflct-tests@0|multi-inject.ts|Warrior": Warrior
}), Reflect);
