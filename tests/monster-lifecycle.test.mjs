import assert from 'node:assert/strict';
import test from 'node:test';
import { MonsterLifecycle } from '../src/core/monster-lifecycle.ts';

test('monster lifecycle survives repeated complete death and respawn cycles', () => {
  const lifecycle = new MonsterLifecycle();
  for (let cycle = 1; cycle <= 5; cycle += 1) {
    assert.equal(lifecycle.state, 'alive');
    assert.equal(lifecycle.kill(2, 0.5), true);
    assert.equal(lifecycle.kill(2, 0.5), false, 'dead monster cannot be killed twice');
    assert.deepEqual(lifecycle.tick(0.49), []);
    assert.deepEqual(lifecycle.tick(0.01), ['corpse-finished']);
    assert.equal(lifecycle.state, 'despawned');
    assert.deepEqual(lifecycle.tick(1.99), []);
    assert.deepEqual(lifecycle.tick(0.01), ['respawn']);
    assert.equal(lifecycle.generation, cycle + 1);
  }
});

test('delayed boss spawn produces a fresh first generation', () => {
  const lifecycle = new MonsterLifecycle(3);
  assert.equal(lifecycle.state, 'despawned');
  assert.equal(lifecycle.generation, 0);
  assert.deepEqual(lifecycle.tick(2.9), []);
  assert.deepEqual(lifecycle.tick(0.1), ['respawn']);
  assert.equal(lifecycle.generation, 1);
});
