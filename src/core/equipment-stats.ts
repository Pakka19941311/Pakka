import { baseVitals, classCombatProfile, statsAtLevel } from './game-rules.ts';
import type { BaseStats } from './game-rules.ts';
import { integerItemStats, itemSpeedToWorldUnits } from './item-progression.ts';
import type { ItemStatDefinition, ItemStatContribution } from './item-progression.ts';
export type { ItemStatDefinition, ItemStatContribution } from './item-progression.ts';

export type EquipmentCombatStats = BaseStats & Omit<ItemStatContribution, 'hp' | 'mp'>;
export type EquipmentStats = { stats: EquipmentCombatStats; maxHp: number; maxMp: number };

/** Exact integer contribution used by the item tooltip and combat. Speed is in percent. */
export function itemStatContribution(definition: ItemStatDefinition, plus: number, legacyBonus?: Partial<ItemStatContribution>): ItemStatContribution {
  return integerItemStats(definition, plus, legacyBonus);
}

export function itemStatBreakdown(definition: ItemStatDefinition, plus: number, legacyBonus?: Partial<ItemStatContribution>): {
  base: ItemStatContribution;
  bonus: ItemStatContribution;
  total: ItemStatContribution;
} {
  const base = itemStatContribution(definition, 0);
  const total = itemStatContribution(definition, plus, legacyBonus);
  const bonus = { ...total };
  for (const key of Object.keys(total) as Array<keyof ItemStatContribution>) bonus[key] -= base[key];
  return { base, bonus, total };
}

/** Shared by the live character and previews of a validated equipment replacement. */
export function calculateEquipmentStats<T extends { plus: number; legacyRingBonus?: Partial<ItemStatContribution> }>(
  classId: string,
  baseStats: BaseStats,
  level: number,
  equipment: Readonly<Record<string, T | undefined>>,
  definitionFor: (item: T) => ItemStatDefinition,
): EquipmentStats {
  const grown = statsAtLevel(classId, baseStats, level);
  const stats: BaseStats = {
    str: Math.round(grown.str), dex: Math.round(grown.dex), int: Math.round(grown.int),
    vit: Math.round(grown.vit), spi: Math.round(grown.spi),
  };
  const contributions = Object.values(equipment).filter((item): item is T => !!item)
    .map(item => itemStatContribution(definitionFor(item), item.plus, item.legacyRingBonus));
  for (const contribution of contributions) {
    for (const key of ['str', 'dex', 'int', 'vit', 'spi'] as const) stats[key] += contribution[key];
  }
  const profile = classCombatProfile(classId, level, stats);
  const computed: EquipmentCombatStats = {
    ...stats,
    atkMin: Math.round(profile.physicalScaling),
    atkMax: Math.round(profile.physicalScaling),
    matk: Math.round(profile.magicScaling),
    def: Math.round(stats.vit * 1.2 + level * 0.7),
    mdef: Math.round(stats.spi * 1.15 + level * 0.65),
    crit: profile.critChance,
    accuracy: Math.round(profile.accuracy),
    evasion: stats.dex * 0.45,
    speed: profile.movementSpeed,
  };
  let gearHp = 0;
  let gearMp = 0;
  for (const contribution of contributions) {
    for (const key of ['atkMin', 'atkMax', 'matk', 'def', 'mdef', 'crit', 'accuracy', 'evasion'] as const) {
      computed[key] += contribution[key];
    }
    computed.speed += itemSpeedToWorldUnits(contribution.speed);
    gearHp += contribution.hp;
    gearMp += contribution.mp;
  }
  if(classId==='assassin'){
    const penalty=Object.values(equipment).filter(item=>item&&definitionFor(item).assassinForeign).length*2;
    for(const key of ['def','mdef','evasion'] as const)computed[key]=Math.max(0,computed[key]-penalty);
  }
  const vitals = baseVitals(classId, level, stats);
  return { stats: computed, maxHp: vitals.hp + gearHp, maxMp: vitals.mp + gearMp };
}
