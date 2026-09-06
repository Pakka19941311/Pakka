export const ATTACK_ACCURACY = {
  reference: 80,
  halfMissEvery: 32,
  maximumMiss: 0.01,
  minimumMiss: 0.001,
} as const;

/** Player attacks only. Enemy attacks and defense are deliberately outside this rule. */
export function attackMissChance(accuracy: number): number {
  const rating = Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0;
  return Math.max(ATTACK_ACCURACY.minimumMiss, Math.min(ATTACK_ACCURACY.maximumMiss,
    ATTACK_ACCURACY.maximumMiss * 2 ** (-(rating - ATTACK_ACCURACY.reference) / ATTACK_ACCURACY.halfMissEvery)));
}

/** Call once per actual contacted target, after an attack has validly released. */
export function resolveAttackAccuracy(accuracy: number, roll: number): {hit: boolean; missChance: number} {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('Attack roll must be in [0, 1).');
  const missChance = attackMissChance(accuracy);
  return {hit: roll >= missChance, missChance};
}
