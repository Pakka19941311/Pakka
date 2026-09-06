import assert from 'node:assert/strict';
import test from 'node:test';
import { attackMissChance, resolveAttackAccuracy } from '../src/core/attack-accuracy.ts';
import { calculateEquipmentStats } from '../src/core/equipment-stats.ts';
import { CLASSES, ITEMS } from '../src/data/game-data.ts';

test('MISS is exactly one percent at rating80, halves each32 rating, and never drops below one tenth percent', () => {
  assert.equal(attackMissChance(0), 0.01);
  assert.equal(attackMissChance(80), 0.01);
  assert.equal(attackMissChance(112), 0.005);
  assert.equal(attackMissChance(144), 0.0025);
  assert.equal(attackMissChance(176), 0.00125);
  assert.equal(attackMissChance(1000), 0.001);
  for (let accuracy = 0; accuracy <= 1000; accuracy++) {
    assert.ok(attackMissChance(accuracy) <= 0.01 && attackMissChance(accuracy) >= 0.001);
    if (accuracy) assert.ok(attackMissChance(accuracy) <= attackMissChance(accuracy - 1));
  }
});

test('deterministic hit resolution has no ambiguity at the exact probability boundary', () => {
  for (const accuracy of [0, 80, 112, 144, 176, 200]) {
    const threshold = attackMissChance(accuracy);
    assert.equal(resolveAttackAccuracy(accuracy, 0).hit, false);
    assert.equal(resolveAttackAccuracy(accuracy, threshold - Number.EPSILON).hit, false);
    assert.equal(resolveAttackAccuracy(accuracy, threshold).hit, true);
    assert.equal(resolveAttackAccuracy(accuracy, 1 - Number.EPSILON).hit, true);
  }
  for (const invalid of [-1, 1, NaN, Infinity]) assert.throws(() => resolveAttackAccuracy(80, invalid), RangeError);
  for (const invalidAccuracy of [NaN, -100, Infinity]) assert.equal(attackMissChance(invalidAccuracy), 0.01);
});

test('ten thousand evenly spaced rolls produce100 misses at baseline and10 at the floor', () => {
  for (const [accuracy, expected] of [[80, 100], [200, 10]]) {
    let misses = 0;
    for (let i = 0; i < 10000; i++) if (!resolveAttackAccuracy(accuracy, (i + 0.5) / 10000).hit) misses++;
    assert.equal(misses, expected);
  }
});

test('every class starts with an extremely rare MISS and stronger enhancement reduces it', () => {
  for (const [classId, definition] of Object.entries(CLASSES)) {
    const stats = plus => calculateEquipmentStats(classId, definition.stats, 1, {
      weapon: {id: definition.weapon, plus}, chest: {id: definition.armor, plus: 0},
    }, item => ITEMS[item.id]).stats;
    const initial = attackMissChance(stats(0).accuracy);
    const good = attackMissChance(stats(7).accuracy);
    const top = attackMissChance(stats(9).accuracy);
    assert.ok(initial <= 0.01 && initial >= 0.004, `${classId} low base miss chance`);
    assert.ok(good < initial && top < good, `${classId} enhancement helps actual accuracy`);
  }
});
