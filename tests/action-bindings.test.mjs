import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumableActionForCode,
  keyLabel,
  normalizeConsumableBindings,
} from '../src/controls/action-bindings.ts';

test('consumable bindings preserve defaults and repair duplicate keys', () => {
  assert.deepEqual(normalizeConsumableBindings(), { potion: 'KeyQ', ether: 'KeyE' });
  const repaired = normalizeConsumableBindings({ potion: 'KeyR', ether: 'KeyR' });
  assert.equal(repaired.potion, 'KeyR');
  assert.notEqual(repaired.ether, repaired.potion);
});

test('configured keys resolve to one consumable action', () => {
  const bindings = normalizeConsumableBindings({ potion: 'KeyF', ether: 'KeyG' });
  assert.equal(consumableActionForCode(bindings, 'KeyF'), 'potion');
  assert.equal(consumableActionForCode(bindings, 'KeyG'), 'ether');
  assert.equal(consumableActionForCode(bindings, 'KeyQ'), null);
  assert.equal(keyLabel('KeyF'), 'F');
});
