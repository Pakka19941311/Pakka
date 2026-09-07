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

test('unavailable nearby target leaves ordinary patrols running, including a safe last position', () => {
  for (const playerSafe of [false, true]) {
    const brain = new MonsterAiBrain(4);
    const unavailable = { ...base, targetAvailable: false, playerSafe, playerDistance: 0.5 };
    assert.equal(brain.update(unavailable).state, 'idle');
    assert.equal(brain.update({ ...unavailable, dt: 5 }).intent, 'patrol');
    assert.equal(brain.update({ ...unavailable, homeDistance: 3 }).intent, 'patrol');
    assert.equal(brain.update({ ...unavailable, atPatrolPoint: true }).intent, 'none');
    assert.equal(brain.update({ ...unavailable, dt: 5 }).intent, 'patrol');
  }
});

test('losing an engaged target returns home once, resumes patrol and can acquire a respawned target', () => {
  const brain = new MonsterAiBrain(2);
  brain.update(base);
  brain.update({ ...base, playerDistance: 7, homeDistance: 2 });
  assert.equal(brain.update({ ...base, playerDistance: 1, homeDistance: 3 }).intent, 'attack');
  const unavailable = { ...base, targetAvailable: false, playerDistance: 1 };
  assert.equal(brain.update({ ...unavailable, homeDistance: 3 }).intent, 'return');
  assert.equal(brain.update({ ...unavailable, homeDistance: 1 }).state, 'return');
  assert.equal(brain.update({ ...unavailable, homeDistance: 0.2 }).state, 'idle');
  assert.equal(brain.update({ ...unavailable, dt: 5 }).intent, 'patrol');
  assert.equal(brain.update({ ...unavailable, targetAvailable: true }).intent, 'attack');
});

test('a wall prevents fresh acquisition; lost sight enters bounded search and reacquires the same target', () => {
  const brain = new MonsterAiBrain(11);
  const target = { ...base, targetId: 'hero-a', playerDistance: 4, homeDistance: 2 };
  assert.equal(brain.update({ ...target, targetVisible: false }).state, 'idle');
  assert.equal(brain.targetId, null);
  assert.equal(brain.update(target).state, 'aggro');
  assert.equal(brain.targetId, 'hero-a');
  assert.equal(brain.update({ ...target, targetVisible: false }).state, 'search');
  for (let tick = 0; tick < 8; tick++) {
    const decision = brain.update({ ...target, targetVisible: false });
    assert.equal(decision.intent, 'search');
    assert.equal(decision.targetId, 'hero-a');
  }
  assert.equal(brain.update(target).state, 'chase');
  assert.equal(brain.update({ ...target, playerDistance: 1 }).state, 'attack');
});

test('search expires in simulation seconds and return ignores a nearby target until home', () => {
  for (const dt of [1 / 20, 1 / 60, 1 / 120]) {
    const brain = new MonsterAiBrain();
    const target = { ...base, dt, targetId: 'hero-a', playerDistance: 4, homeDistance: 4 };
    brain.update(target);
    brain.update({ ...target, targetVisible: false });
    let elapsed = 0;
    while (brain.state === 'search' && elapsed < 2) {
      brain.update({ ...target, targetVisible: false });
      elapsed += dt;
    }
    assert.ok(elapsed >= 1.5 - 1e-8 && elapsed <= 1.5 + dt + 1e-8, `search elapsed ${elapsed} at ${dt}`);
    assert.equal(brain.state, 'leash');
    assert.equal(brain.targetId, null);
    assert.equal(brain.update({ ...target, playerDistance: 1 }).state, 'return');
    assert.equal(brain.update({ ...target, playerDistance: 1, homeDistance: 0.1 }).state, 'idle');
  }
});

test('target identity does not silently switch when a different nearby character is supplied', () => {
  const brain = new MonsterAiBrain();
  brain.update({ ...base, targetId: 'hero-a', playerDistance: 3, homeDistance: 3 });
  const decision = brain.update({ ...base, targetId: 'hero-b', playerDistance: 1, homeDistance: 3 });
  assert.equal(decision.intent, 'return');
  assert.equal(decision.targetId, null);
});

test('provocation permits retaliation beyond ordinary aggro but never bypasses walls or leash', () => {
  const brain = new MonsterAiBrain();
  const target = { ...base, targetId: 'ranger', playerDistance: 13, homeDistance: 2, provoked: true };
  assert.equal(brain.update({ ...target, targetVisible: false }).intent, 'search');
  assert.equal(brain.update(target).intent, 'chase');
  assert.equal(brain.update({ ...target, homeDistance: 15 }).intent, 'return');
  assert.equal(brain.targetId, null);
});

test('safe unengaged characters do not freeze patrol and safe engaged targets trigger return', () => {
  const brain = new MonsterAiBrain(4);
  const safe = { ...base, targetId: 'safe-hero', playerDistance: 1, playerSafe: true };
  assert.equal(brain.update(safe).intent, 'none');
  assert.equal(brain.update({ ...safe, dt: 5 }).intent, 'patrol');
  brain.update({ ...safe, playerSafe: false, homeDistance: 3 });
  assert.equal(brain.update({ ...safe, homeDistance: 3 }).intent, 'return');
});

test('terminal lifecycle blocks all AI and target retention until an explicit respawn reset', () => {
  const brain = new MonsterAiBrain();
  const target = { ...base, targetId: 'hero-a', playerDistance: 1, homeDistance: 1 };
  brain.update(target);
  const death = brain.update({ ...target, alive: false });
  assert.equal(death.state, 'dead');
  assert.equal(death.targetId, null);
  for (const state of ['dead', 'corpse', 'despawn']) {
    brain.forceLifecycle(state);
    for (const alive of [false, true]) assert.equal(brain.update({ ...target, alive }).state, state);
    assert.equal(brain.update(target).intent, 'none');
  }
  brain.reset(3);
  assert.equal(brain.state, 'spawn');
  assert.equal(brain.update(target).state, 'aggro');
});

test('unreachable patrol points yield to an idle pause rather than walking forever', () => {
  const brain = new MonsterAiBrain(5);
  const empty = { ...base, targetAvailable: false, playerDistance: Infinity };
  brain.update(empty);
  brain.update({ ...empty, dt: 5 });
  assert.equal(brain.state, 'patrol');
  for (let tick = 0; tick < 90; tick++) brain.update(empty);
  assert.equal(brain.state, 'idle');
  assert.equal(brain.update({ ...empty, dt: 4 }).state, 'patrol');
});

test('a minute without players alternates finite walking bouts and natural idle pauses', () => {
  const brain = new MonsterAiBrain(29);
  let idleSeconds = 0;
  let patrolSeconds = 0;
  let currentBout = 0;
  let completedPatrols = 0;
  for (let tick = 0; tick < 1200; tick++) {
    const wasPatrol = brain.state === 'patrol';
    const decision = brain.update({ ...base, dt: .05, targetAvailable: false,
      playerDistance: Infinity, atPatrolPoint: wasPatrol && currentBout >= 2 });
    if (decision.state === 'patrol') { patrolSeconds += .05; currentBout += .05; }
    else { idleSeconds += .05; if (wasPatrol) completedPatrols++; currentBout = 0; }
  }
  assert.ok(completedPatrols >= 10);
  assert.ok(idleSeconds > 15 && patrolSeconds > 15);
  assert.ok(Math.abs(idleSeconds + patrolSeconds - 60) < 1e-8);
});

test('attack range edge uses a narrow exit tolerance without extending acquisition range', () => {
  const brain = new MonsterAiBrain();
  const target = { ...base, targetId: 'hero-a', playerDistance: 1.65 };
  brain.update(target);
  assert.equal(brain.update(target).state, 'attack');
  assert.equal(brain.update({ ...target, playerDistance: 1.7 }).state, 'attack');
  assert.equal(brain.update({ ...target, playerDistance: 1.8 }).state, 'chase');
  assert.equal(brain.update({ ...target, playerDistance: 1.7 }).state, 'chase');
});
