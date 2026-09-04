import assert from 'node:assert/strict';
import test from 'node:test';
import { MonsterAiBrain } from '../src/world/monster-ai.ts';

const base = { dt: 0.1, alive: true, playerSafe: false, playerDistance: 30, homeDistance: 0, atPatrolPoint: false, aggroRadius: 9, leashRadius: 14, attackRange: 1.65 };

test('monster lifecycle states lead into unscripted idle and patrol', () => {
  const brain = new MonsterAiBrain(4);
  assert.equal(brain.update(base).state, 'idle');
  const patrol = brain.update({ ...base, dt: 5 });
  assert.equal(patrol.state, 'patrol');
  assert.equal(patrol.intent, 'patrol');
  assert.equal(brain.update({ ...base, atPatrolPoint: true }).state, 'idle');
});

test('monster acquires, chases and attacks before respecting leash', () => {
  const brain = new MonsterAiBrain(2);
  brain.update(base);
  assert.equal(brain.update({ ...base, playerDistance: 7 }).state, 'aggro');
  assert.equal(brain.update({ ...base, playerDistance: 5 }).state, 'chase');
  assert.equal(brain.update({ ...base, playerDistance: 1.3 }).state, 'attack');
  const leash = brain.update({ ...base, playerDistance: 2, homeDistance: 15 });
  assert.equal(leash.state, 'leash');
  assert.equal(leash.intent, 'return');
  assert.equal(brain.update({ ...base, homeDistance: 7 }).state, 'return');
  assert.equal(brain.update({ ...base, homeDistance: 0.2 }).state, 'idle');
});

test('dead, corpse and despawn lifecycle states are explicit', () => {
  const brain = new MonsterAiBrain();
  assert.equal(brain.update({ ...base, alive: false }).state, 'dead');
  assert.equal(brain.forceLifecycle('corpse').state, 'corpse');
  assert.equal(brain.forceLifecycle('despawn').state, 'despawn');
  brain.reset(7);
  assert.equal(brain.state, 'spawn');
});
