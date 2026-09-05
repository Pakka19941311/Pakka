import { baseVitals, classCombatProfile, enhancementStatMultiplier, statsAtLevel } from './game-rules.ts';
import type { BaseStats } from './game-rules.ts';

export type ItemStatDefinition = {
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
  speed?: number;
};
export type ItemStatContribution = {
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
export type EquipmentCombatStats = BaseStats & Omit<ItemStatContribution, 'hp' | 'mp'>;
export type EquipmentStats = { stats: EquipmentCombatStats; maxHp: number; maxMp: number };

/** The actual contribution used by combat, including the existing speed-unit conversion. */
export function itemStatContribution(definition: ItemStatDefinition, plus: number): ItemStatContribution {
  const multiplier = enhancementStatMultiplier(definition.slot === 'weapon' ? 'weapon' : 'armor', plus);
  return {
    atkMin: (definition.atk?.[0] ?? 0) * multiplier,
    atkMax: (definition.atk?.[1] ?? 0) * multiplier,
    matk: (definition.matk ?? 0) * multiplier,
    def: (definition.def ?? 0) * multiplier,
    mdef: (definition.mdef ?? 0) * multiplier,
    hp: definition.hp ?? 0,
    mp: definition.mp ?? 0,
    crit: definition.crit ?? 0,
    accuracy: definition.accuracy ?? 0,
    evasion: definition.evasion ?? 0,
    speed: (definition.speed ?? 0) * 0.062,
  };
}

export function itemStatBreakdown(definition: ItemStatDefinition, plus: number): {
  base: ItemStatContribution;
  bonus: ItemStatContribution;
  total: ItemStatContribution;
} {
  const base = itemStatContribution(definition, 0);
  const total = itemStatContribution(definition, plus);
  const bonus = { ...total };
  for (const key of Object.keys(total) as Array<keyof ItemStatContribution>) bonus[key] -= base[key];
  return { base, bonus, total };
}

/** Shared by the live character and previews of a validated equipment replacement. */
export function calculateEquipmentStats<T extends { plus: number }>(
  classId: string,
  baseStats: BaseStats,
  level: number,
  equipment: Readonly<Record<string, T | undefined>>,
  definitionFor: (item: T) => ItemStatDefinition,
): EquipmentStats {
  const stats = statsAtLevel(classId, baseStats, level);
  const profile = classCombatProfile(classId, level, stats);
  const computed: EquipmentCombatStats = {
    ...stats,
    atkMin: profile.physicalScaling,
    atkMax: profile.physicalScaling,
    matk: profile.magicScaling,
    def: stats.vit * 1.2 + level * 0.7,
    mdef: stats.spi * 1.15 + level * 0.65,
    crit: profile.critChance,
    accuracy: profile.accuracy,
    evasion: stats.dex * 0.45,
    speed: profile.movementSpeed,
  };
  let gearHp = 0;
  let gearMp = 0;
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const contribution = itemStatContribution(definitionFor(item), item.plus);
    for (const key of ['atkMin', 'atkMax', 'matk', 'def', 'mdef', 'crit', 'accuracy', 'evasion', 'speed'] as const) {
      computed[key] += contribution[key];
    }
    gearHp += contribution.hp;
    gearMp += contribution.mp;
  }
  const vitals = baseVitals(classId, level, stats);
  return { stats: computed, maxHp: vitals.hp + gearHp, maxMp: vitals.mp + gearMp };
}
