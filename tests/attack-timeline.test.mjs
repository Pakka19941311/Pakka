import assert from 'node:assert/strict';
import test from 'node:test';
import { AttackTimeline, combatTimings } from '../src/combat/attack-timeline.ts';

test('attack timeline exposes windup, impact frame, recovery and completion', () => {
  const timeline = new AttackTimeline({ windup: 0.3, recovery: 0.5 });
  assert.equal(timeline.phase, 'windup');
  assert.deepEqual(timeline.tick(0.29), []);
  assert.deepEqual(timeline.tick(0.01), ['impact']);
  assert.equal(timeline.phase, 'recovery');
  assert.deepEqual(timeline.tick(0.5), ['complete']);
  assert.equal(timeline.phase, 'complete');
});

test('large frame steps cannot skip the actual hit event', () => {
  const timeline = new AttackTimeline({ windup: 0.2, recovery: 0.3 });
  assert.deepEqual(timeline.tick(0.7), ['impact', 'complete']);
  assert.deepEqual(timeline.tick(1), []);
});

test('spell and ranged attacks retain readable windups', () => {
  assert.ok(combatTimings('spell').windup > combatTimings('ranged').windup);
  assert.ok(combatTimings('ranged').windup > combatTimings('melee').windup);
});
