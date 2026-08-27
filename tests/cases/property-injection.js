

const __RFLCT_Weapon = Symbol.for("rflct-tests@0|property-injection.ts|Weapon");
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
Reflect.defineMetadata("design:properties", ["weapon", "name"], Warrior);
Reflect.defineMetadata("design:paramtypes", [{ type: Number, metadata: {} }], Warrior, undefined);
Reflect.defineMetadata("design:paramtypes", [{ type: String, metadata: { optional: true } }], Warrior.prototype, "name");
Reflect.defineMetadata("design:paramtypes", [{ type: __RFLCT_Weapon, metadata: {} }], Warrior.prototype, "weapon");

Reflect.defineMetadata("design:symbols", Object.assign(Reflect.getMetadata("design:symbols", Reflect) ?? {}, {
  "rflct-tests@0|property-injection.ts|Weapon": __RFLCT_Weapon,
  "rflct-tests@0|property-injection.ts|Warrior": Warrior
}), Reflect);
