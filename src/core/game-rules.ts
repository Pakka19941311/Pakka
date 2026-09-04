export type BaseStats = {
  str: number;
  dex: number;
  int: number;
  vit: number;
  spi: number;
};

export const MAX_LEVEL = 100;
export const INVENTORY_CAPACITY = 42;
export const SAFE_ENHANCEMENT_MAX = 3;
export const MINI_BOSS_RESPAWN_SECONDS = { min: 30 * 60, max: 50 * 60 } as const;
export const PIT_BOSS_RESPAWN_SECONDS = 7 * 60 * 60;

export const ENHANCEMENT_CHANCES = [
  1, 1, 1, 0.7, 0.6, 0.5, 0.4, 0.32, 0.25, 0.19, 0.14, 0.1, 0.07, 0.05, 0.03,
] as const;

const WEAPON_ENHANCEMENT_BONUS = [
  0, 0.04, 0.08, 0.12, 0.17, 0.22, 0.28, 0.34, 0.41, 0.48, 0.56, 0.65, 0.75, 0.86, 0.98, 1.12,
] as const;

const ARMOR_ENHANCEMENT_BONUS = [
  0, 0.03, 0.06, 0.09, 0.13, 0.17, 0.22, 0.27, 0.33, 0.39, 0.46, 0.54, 0.63, 0.73, 0.84, 0.96,
] as const;

const GROWTH: Record<string, BaseStats> = {
  knight: { str: 0.22, dex: 0.07, int: 0.02, vit: 0.24, spi: 0.05 },
  mage: { str: 0.04, dex: 0.08, int: 0.28, vit: 0.08, spi: 0.24 },
  assassin: { str: 0.17, dex: 0.26, int: 0.03, vit: 0.12, spi: 0.07 },
  ranger: { str: 0.12, dex: 0.24, int: 0.05, vit: 0.11, spi: 0.1 },
  necro: { str: 0.05, dex: 0.08, int: 0.25, vit: 0.11, spi: 0.23 },
};

export function statsAtLevel(classId: string, base: BaseStats, level: number): BaseStats {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const growth = GROWTH[classId] ?? GROWTH.knight;
  const gained = clamped - 1;
  return {
    str: round2(base.str + growth.str * gained),
    dex: round2(base.dex + growth.dex * gained),
    int: round2(base.int + growth.int * gained),
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
      hp: Math.round(250 + 35 * gained + 28 * stats.vit),
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
  critChance: number;
  critMultiplier: number;
  movementSpeed: number;
  attackInterval: number;
};

export function classCombatProfile(classId: string, level: number, stats: BaseStats): ClassCombatProfile {
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
    ranger: { critMultiplier: 1.55, movementSpeed: 108, critBase: 8, critDex: 0.17, critCap: 55, baseInterval: 1.02, speedCap: 0.35 },
    necro: { critMultiplier: 1.5, movementSpeed: 98, critBase: 4, critDex: 0.08, critCap: 50, baseInterval: 1.45, speedCap: 0.24 },
  };
  const profile = profiles[classId] ?? profiles.knight;
  const physicalScaling = classId === 'knight'
    ? stats.str * 2.6 + stats.dex * 0.25
    : classId === 'assassin'
      ? stats.str * 1.5 + stats.dex * 1.35
      : classId === 'ranger'
        ? stats.dex * 2.3 + stats.str * 0.4
        : stats.str * 1.2;
  const magicScaling = classId === 'mage'
    ? stats.int * 2.8 + stats.spi * 0.5
    : classId === 'necro'
      ? stats.int * 2.5 + stats.spi * 0.8
      : stats.int * 1.1;
  const accuracy = classId === 'knight'
    ? 70 + stats.dex * 1.3 + level * 0.15
    : classId === 'assassin'
      ? 75 + stats.dex * 1.7 + level * 0.15
      : classId === 'ranger'
        ? 78 + stats.dex * 1.8 + level * 0.15
        : 78 + stats.int * 1.45 + level * 0.15;
  const speedMultiplier = 1 + Math.min(profile.speedCap, (stats.dex / (stats.dex + 180)) * 0.45);
  return {
    physicalScaling,
    magicScaling,
    accuracy,
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
