import assert from 'node:assert/strict';
import test from 'node:test';
import { addOrStackItem, applyExperience, equipmentSlot, resolveEnhancement } from '../src/core/gameplay-session.ts';
import { xpNeeded } from '../src/core/game-rules.ts';

test('scenario: farming grants XP and levels without scaling enemies', () => {
  const result = applyExperience(1, 0, xpNeeded(1) + xpNeeded(2) + 10);
  assert.deepEqual(result, { level: 3, xp: 10, levelsGained: 2 });
});

test('scenario: auto-loot stacks materials and protects overflow', () => {
  const inventory = [{ id: 'wolf_fang', count: 2 }];
  assert.equal(addOrStackItem(inventory, { id: 'wolf_fang', count: 3 }, true, 2), 'stacked');
  assert.equal(inventory[0].count, 5);
  assert.equal(addOrStackItem(inventory, { id: 'wolf_gloves', count: 1 }, false, 2), 'added');
  assert.equal(addOrStackItem(inventory, { id: 'potion', count: 1 }, true, 2), 'full');
});

test('scenario: equipment has no level gate and rings choose an open slot', () => {
  assert.equal(equipmentSlot('weapon', {}), 'weapon');
  assert.equal(equipmentSlot('ring', {}), 'ring1');
  assert.equal(equipmentSlot('ring', { ring1: { id: 'ember_ring' } }), 'ring2');
});

test('scenario: +0 through +3 is safe, then failure destroys the item', () => {
  let level = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = resolveEnhancement(level, 0.999);
    assert.equal(outcome.kind, 'success');
    level = outcome.level;
  }
  assert.equal(level, 3);
  assert.deepEqual(resolveEnhancement(3, 0.999), { kind: 'destroyed', level: 3 });
});
