import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MINI_BOSS_RESPAWN_SECONDS,
  PIT_BOSS_RESPAWN_SECONDS,
  baseVitals,
  bossRespawnSeconds,
  classCombatProfile,
  enhancementCanDestroy,
  enhancementChance,
  enhancementStatMultiplier,
  monsterMovementSpeed,
  statsAtLevel,
  xpNeeded,
} from '../src/core/game-rules.ts';
import { CLASSES } from '../src/data/game-data.ts';

test('locked Knight level-one values remain 642 HP, 96 MP and 150 XP', () => {
  const stats = statsAtLevel('knight', CLASSES.knight.stats, 1);
  assert.deepEqual(stats, { str: 12, dex: 6, int: 2, vit: 14, spi: 4 });
  assert.deepEqual(baseVitals('knight', 1, stats), { hp: 642, mp: 96 });
  assert.equal(xpNeeded(1), 150);
});

test('progression grows monotonically and never uses world scaling', () => {
  let previous = 0;
  for (let level = 1; level <= 100; level += 1) {
    const needed = xpNeeded(level);
    assert.ok(needed > previous);
    previous = needed;
  }
  assert.equal(xpNeeded(10), 33_580);
});

test('enhancement is safe through +3 and destructive from +3 to +4', () => {
  assert.equal(enhancementChance(0), 1);
  assert.equal(enhancementChance(1), 1);
  assert.equal(enhancementChance(2), 1);
  assert.equal(enhancementChance(3), 0.7);
  assert.equal(enhancementCanDestroy(2), false);
  assert.equal(enhancementCanDestroy(3), true);
  assert.equal(enhancementChance(15), 0);
});

test('weapon and armor enhancement follow the locked nonlinear curves', () => {
  assert.equal(enhancementStatMultiplier('weapon', 0), 1);
  assert.equal(enhancementStatMultiplier('weapon', 3), 1.12);
  assert.equal(enhancementStatMultiplier('weapon', 15), 2.12);
  assert.equal(enhancementStatMultiplier('armor', 3), 1.09);
  assert.equal(enhancementStatMultiplier('armor', 15), 1.96);
});

test('boss respawns match the design lock', () => {
  assert.equal(bossRespawnSeconds('mini', () => 0), MINI_BOSS_RESPAWN_SECONDS.min);
  assert.equal(bossRespawnSeconds('mini', () => 1), MINI_BOSS_RESPAWN_SECONDS.max);
  assert.equal(bossRespawnSeconds('big'), PIT_BOSS_RESPAWN_SECONDS);
  assert.equal(PIT_BOSS_RESPAWN_SECONDS, 25_200);
});

test('all five classes retain four active skills', () => {
  assert.deepEqual(Object.keys(CLASSES), ['knight', 'mage', 'assassin', 'ranger', 'necro']);
  for (const classDef of Object.values(CLASSES)) assert.equal(classDef.skills.length, 4);
});

test('all class base attributes and vitals match Master GDD v4', () => {
  const expected = {
    knight: [{ str: 12, dex: 6, int: 2, vit: 14, spi: 4 }, { hp: 642, mp: 96 }],
    mage: [{ str: 3, dex: 7, int: 15, vit: 6, spi: 13 }, { hp: 270, mp: 454 }],
    assassin: [{ str: 9, dex: 15, int: 3, vit: 8, spi: 6 }, { hp: 370, mp: 180 }],
    ranger: [{ str: 7, dex: 14, int: 5, vit: 8, spi: 8 }, { hp: 380, mp: 218 }],
    necro: [{ str: 4, dex: 8, int: 14, vit: 8, spi: 13 }, { hp: 344, mp: 421 }],
  };
  for (const [id, [stats, vitals]] of Object.entries(expected)) {
    assert.deepEqual(CLASSES[id].stats, stats);
    assert.deepEqual(baseVitals(id, 1, stats), vitals);
  }
});

test('class combat profiles preserve role, crit and movement differences', () => {
  const knight = classCombatProfile('knight', 1, CLASSES.knight.stats);
  const assassin = classCombatProfile('assassin', 1, CLASSES.assassin.stats);
  const ranger = classCombatProfile('ranger', 1, CLASSES.ranger.stats);
  assert.equal(knight.movementSpeed, 5.89);
  assert.ok(assassin.movementSpeed > ranger.movementSpeed);
  assert.ok(assassin.critChance > knight.critChance);
  assert.equal(assassin.critMultiplier, 1.65);
});

test('ordinary monsters remain clearly slower than every player class', () => {
  const slowestPlayer = Math.min(...Object.entries(CLASSES).map(([id, classDef]) => (
    classCombatProfile(id, 1, classDef.stats).movementSpeed
  )));
  assert.ok(monsterMovementSpeed(false) < slowestPlayer);
  assert.ok(monsterMovementSpeed(true) < monsterMovementSpeed(false));
});
