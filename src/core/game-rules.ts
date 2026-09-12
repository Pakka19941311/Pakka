import { ENHANCEMENT_PERCENT } from './enhancement-v2.ts';
export type BaseStats = {
  str: number;
  dex: number;
  int: number;
  vit: number;
  spi: number;
};

export const MAX_LEVEL = 90;
export const INVENTORY_CAPACITY = 42;
export const SAFE_ENHANCEMENT_MAX = 3;
export const MINI_BOSS_RESPAWN_SECONDS = { min: 30 * 60, max: 50 * 60 } as const;
export const PIT_BOSS_RESPAWN_SECONDS = 7 * 60 * 60;

export const ENHANCEMENT_CHANCES = ENHANCEMENT_PERCENT.weapon_normal.map(p=>p/100);

const WEAPON_ENHANCEMENT_BONUS = [
  0, 0.04, 0.08, 0.12, 0.17, 0.22, 0.28, 0.34, 0.41, 0.48, 0.56, 0.65, 0.75, 0.86, 0.98, 1.12,
] as const;

const ARMOR_ENHANCEMENT_BONUS = [
  0, 0.03, 0.06, 0.09, 0.13, 0.17, 0.22, 0.27, 0.33, 0.39, 0.46, 0.54, 0.63, 0.73, 0.84, 0.96,
] as const;

const GROWTH: Record<string, {str:number;dex:number;int:number;vit:number;spi:number}> = {
  // STR/DEX/INT are level intervals (zero means no growth); VIT/SPI keep their per-level rates.
  knight: { str: 3, dex: 5, int: 5, vit: 0.24, spi: 0.05 },
  mage: { str: 3, dex: 5, int: 3, vit: 0.08, spi: 0.24 },
  assassin: { str: 3, dex: 3, int: 0, vit: 0.12, spi: 0.07 },
  ranger: { str: 4, dex: 3, int: 4, vit: 0.11, spi: 0.1 },
  necro: { str: 4, dex: 3, int: 4, vit: 0.11, spi: 0.23 },
};

export function statsAtLevel(classId: string, base: BaseStats, level: number): BaseStats {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const growth = GROWTH[classId] ?? GROWTH.knight;
  const gained = clamped - 1;
  return {
    str: base.str + Math.floor(clamped / growth.str),
    dex: base.dex + Math.floor(clamped / growth.dex),
    int: base.int + (growth.int ? Math.floor(clamped / growth.int) : 0),
    vit: round2(base.vit + growth.vit * gained),
    spi: round2(base.spi + growth.spi * gained),
  };
}

export function xpNeeded(level: number, regionFactor = 1): number {
  return Math.floor(150 * Math.pow(Math.max(1, level), 2.35) * regionFactor);
}

export function baseVitals(classId: string, level: number, stats: BaseStats): { hp: number; mp: number } {
  const gained = Math.max(0, level - 1);
  if (classId === 'knight') {
    return {
      hp: Math.round(250 + 35 * gained + 28 * stats.vit + 10 * stats.str),
      mp: Math.round(60 + 5 * gained + 9 * stats.spi),
    };
  }

  const profiles: Record<string, { hp: number; hpLevel: number; hpVit: number; mp: number; mpLevel: number; mpSpi: number }> = {
    mage: { hp: 180, hpLevel: 22, hpVit: 15, mp: 220, mpLevel: 18, mpSpi: 18 },
    assassin: { hp: 210, hpLevel: 27, hpVit: 20, mp: 120, mpLevel: 9, mpSpi: 10 },
    ranger: { hp: 220, hpLevel: 25, hpVit: 20, mp: 130, mpLevel: 10, mpSpi: 11 },
    necro: { hp: 200, hpLevel: 24, hpVit: 18, mp: 200, mpLevel: 15, mpSpi: 17 },
  };
  const p = profiles[classId] ?? profiles.ranger;
  return {
    hp: Math.round(p.hp + p.hpLevel * gained + p.hpVit * stats.vit),
    mp: Math.round(p.mp + p.mpLevel * gained + p.mpSpi * stats.spi),
  };
}

export function enhancementChance(currentLevel: number): number {
  return ENHANCEMENT_CHANCES[currentLevel] ?? 0;
}

export function enhancementStatMultiplier(kind: 'weapon' | 'armor', level: number): number {
  const clamped = Math.max(0, Math.min(15, Math.floor(level)));
  const curve = kind === 'weapon' ? WEAPON_ENHANCEMENT_BONUS : ARMOR_ENHANCEMENT_BONUS;
  return 1 + curve[clamped];
}

export type ClassCombatProfile = {
  physicalScaling: number;
  magicScaling: number;
  accuracy: number;
  physicalAccuracy: number;
  magicAccuracy: number;
  critChance: number;
  critMultiplier: number;
  movementSpeed: number;
  attackInterval: number;
};

export type AttackDamageType = 'physical' | 'magic';
/** Existing ordinary/skill actions keep their controls; necromancer's ordinary shot is physical. */
export function attackDamageType(classId:string,skill=false):AttackDamageType {
  return classId==='mage'||classId==='necro'&&skill?'magic':'physical';
}
/** Old snapshots are accepted until the authoritative equipment recalculation fills both ratings. */
export function accuracyForDamage(stats:{accuracy:number;physicalAccuracy?:number;magicAccuracy?:number},type:AttackDamageType):number {
  return (type==='magic'?stats.magicAccuracy:stats.physicalAccuracy)??stats.accuracy;
}
export function manaRegenerationPerSecond(classId:string,maxMp:number,stats:Pick<BaseStats,'int'>):number {
  return maxMp*.022+(['mage','necro'].includes(classId)?stats.int*.1:0);
}

export function classCombatProfile(classId: string, _level: number, stats: BaseStats): ClassCombatProfile {
  type StoredProfile = Pick<ClassCombatProfile, 'critMultiplier' | 'movementSpeed'> & {
    critBase: number;
    critDex: number;
    critCap: number;
    baseInterval: number;
    speedCap: number;
  };
  const profiles: Record<string, StoredProfile> = {
    knight: { critMultiplier: 1.5, movementSpeed: 95, critBase: 5, critDex: 0.1, critCap: 50, baseInterval: 1.15, speedCap: 0.3 },
    mage: { critMultiplier: 1.5, movementSpeed: 100, critBase: 4, critDex: 0.07, critCap: 50, baseInterval: 1.5, speedCap: 0.22 },
    assassin: { critMultiplier: 1.65, movementSpeed: 112, critBase: 10, critDex: 0.2, critCap: 60, baseInterval: 0.8, speedCap: 0.42 },
    ranger: { critMultiplier: 1.55, movementSpeed: 108, critBase: 8, critDex: 0.17, critCap: 55, baseInterval: 1.02, speedCap: 0.1 },
    necro: { critMultiplier: 1.5, movementSpeed: 98, critBase: 4, critDex: 0.08, critCap: 50, baseInterval: 1.45, speedCap: 0.24 },
  };
  const profile = profiles[classId] ?? profiles.knight;
  const physicalScaling=Math.floor((['ranger','necro'].includes(classId)?stats.dex:stats.str)/3);
  const magicScaling=Math.floor(stats.int/3);
  const baseAccuracy=classId==='knight'?70:classId==='assassin'?75:78;
  const physicalAccuracy=baseAccuracy+physicalScaling,magicAccuracy=baseAccuracy+magicScaling;
  const accuracy=attackDamageType(classId)==='magic'?magicAccuracy:physicalAccuracy;
  const speedMultiplier = 1 + Math.min(profile.speedCap, (stats.dex / (stats.dex + 180)) * 0.45);
  return {
    physicalScaling,
    magicScaling,
    accuracy,
    physicalAccuracy,
    magicAccuracy,
    critChance: Math.min(profile.critCap, profile.critBase + stats.dex * profile.critDex),
    critMultiplier: profile.critMultiplier,
    movementSpeed: 6.2 * (profile.movementSpeed / 100),
    attackInterval: profile.baseInterval / speedMultiplier,
  };
}

export function classAttackRange(classId: string): number {
  if (classId === 'ranger') return 13;
  if (classId === 'mage') return 9.2;
  if (classId === 'necro') return 9.8;
  return 2.6;
}

export function enhancementCanDestroy(currentLevel: number): boolean {
  return currentLevel >= SAFE_ENHANCEMENT_MAX;
}

export function bossRespawnSeconds(kind: 'mini' | 'big', random = Math.random): number {
  if (kind === 'big') return PIT_BOSS_RESPAWN_SECONDS;
  return Math.round(
    MINI_BOSS_RESPAWN_SECONDS.min +
      random() * (MINI_BOSS_RESPAWN_SECONDS.max - MINI_BOSS_RESPAWN_SECONDS.min),
  );
}

export function monsterMovementSpeed(isBoss: boolean): number {
  return isBoss ? 1.9 : 2.25;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
