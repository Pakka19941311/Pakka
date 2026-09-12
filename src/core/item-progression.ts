/** Integer bonuses at +0…+15. A property's +0 value remains defined by its item. */
export const ITEM_PROGRESSION = {
  weaponMin: [0, 1, 2, 4, 6, 8, 10, 13, 14, 15, 18, 22, 27, 33, 40, 48],
  weaponMax: [0, 1, 2, 4, 8, 12, 18, 25, 35, 47, 61, 77, 95, 115, 137, 161],
  weaponAccuracy: [0, 0, 1, 2, 3, 5, 7, 9, 11, 13, 16, 19, 22, 26, 30, 35],
  defense: [0, 1, 2, 3, 5, 7, 10, 14, 19, 25, 32, 40, 49, 59, 70, 82],
  accessoryAttack: [0, 1, 2, 3, 4, 5, 7, 9, 12, 15, 19, 23, 28, 34, 41, 49],
  vitalPercent: [0, 3, 6, 9, 13, 17, 22, 27, 33, 39, 46, 54, 63, 73, 84, 96],
  secondary: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
} as const;

export type ItemStatDefinition = {
  classes?:readonly string[];assassinForeign?:boolean;
  requiredLevel?:number;ringGrade?:number;maxStack?:number;
  slot?: string;
  atk?: readonly [number, number];
  matk?: number;
  def?: number;
  mdef?: number;
  hp?: number;
  mp?: number;
  crit?: number;
  accuracy?: number;
  evasion?: number;
  /** Percentage points of the common 6.2 m/s reference, not meters per second. */
  speed?: number;
  str?: number;
  dex?: number;
  int?: number;
  vit?: number;
  spi?: number;
};

/** Every field is an integer in item units. Percentages are stored as whole points. */
export type ItemStatContribution = {
  str: number;
  dex: number;
  int: number;
  vit: number;
  spi: number;
  atkMin: number;
  atkMax: number;
  matk: number;
  def: number;
  mdef: number;
  hp: number;
  mp: number;
  crit: number;
  accuracy: number;
  evasion: number;
  speed: number;
};

export function itemEnhancementLevel(plus: number): number {
  return Number.isFinite(plus) ? Math.max(0, Math.min(15, Math.floor(plus))) : 0;
}

function whole(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value!)) : 0;
}

/** Absent properties stay absent: enhancement never invents a new equipment property. */
function increased(value: number | undefined, bonus: number): number {
  const base = whole(value);
  return base === 0 ? 0 : base + bonus;
}

export function integerItemStats(definition: ItemStatDefinition, plus: number, legacyBonus?: Partial<ItemStatContribution>): ItemStatContribution {
  const level = definition.slot&&!['ring','ring1','ring2'].includes(definition.slot) ? itemEnhancementLevel(plus) : 0;
  const weapon = definition.slot === 'weapon';
  const minBonus = weapon ? ITEM_PROGRESSION.weaponMin[level] : ITEM_PROGRESSION.accessoryAttack[level];
  const maxBonus = weapon ? ITEM_PROGRESSION.weaponMax[level] : ITEM_PROGRESSION.accessoryAttack[level];
  const magicBonus = weapon ? Math.round((minBonus + maxBonus) / 2) : ITEM_PROGRESSION.accessoryAttack[level];
  const vital = (value: number | undefined) => {
    const base = whole(value);
    return base + Math.round(base * ITEM_PROGRESSION.vitalPercent[level] / 100);
  };
  const result: ItemStatContribution = {
    str: whole(definition.str), dex: whole(definition.dex), int: whole(definition.int),
    vit: whole(definition.vit), spi: whole(definition.spi),
    atkMin: increased(definition.atk?.[0], minBonus),
    atkMax: increased(definition.atk?.[1], maxBonus),
    matk: increased(definition.matk, magicBonus),
    def: increased(definition.def, ITEM_PROGRESSION.defense[level]),
    mdef: increased(definition.mdef, ITEM_PROGRESSION.defense[level]),
    hp: vital(definition.hp),
    mp: vital(definition.mp),
    crit: increased(definition.crit, ITEM_PROGRESSION.secondary[level]),
    accuracy: increased(definition.accuracy, weapon ? ITEM_PROGRESSION.weaponAccuracy[level] : ITEM_PROGRESSION.secondary[level]),
    evasion: increased(definition.evasion, ITEM_PROGRESSION.secondary[level]),
    speed: increased(definition.speed, ITEM_PROGRESSION.secondary[level]),
  };
  if (legacyBonus) {
    for (const key of Object.keys(result) as Array<keyof ItemStatContribution>) result[key] += whole(legacyBonus[key]);
  }
  return result;
}

/** Conversion is applied only at the boundary between item units and world movement. */
export function itemSpeedToWorldUnits(percent: number): number {
  return percent * 6.2 / 100;
}

/** Stable inverse used for equipment-comparison deltas; class movement stays hidden. */
export function worldSpeedToItemUnits(speed: number): number {
  return Math.round(speed * 100 / 6.2);
}

/** Whole-number power indicator; the exact rolled range remains the displayed min/max. */
export function itemDamageSummary(base: ItemStatContribution, total: ItemStatContribution): {
  base: number; bonus: number; min: number; max: number;
} {
  const basePower = Math.round((base.atkMin + base.atkMax) / 2);
  return {base: basePower, bonus: Math.round((total.atkMin + total.atkMax) / 2) - basePower,
    min: total.atkMin, max: total.atkMax};
}
