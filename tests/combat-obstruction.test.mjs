import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld } from '../src/world/collision-world.ts';

test('a house blocks picking and attacks at the first wall, not the target behind it', () => {
  const world = new CollisionWorld();
  world.addBox(0, 5, 2, 1, 0, 0, 6);
  const from = { x: 0, y: 1.4, z: 0 }, to = { x: 0, y: 1.4, z: 10 };
  assert.equal(world.obstructionDistance(from, to), 4);
  assert.equal(world.hasLineOfSight(from, to), false);
  assert.equal(world.hasLineOfSight(from, { ...to, z: 3 }), true, 'objects beyond the target do not block it');
});

test('finite height and open gates preserve valid combat sight lines', () => {
  const world = new CollisionWorld();
  world.addBox(-3, 5, 2, 0.5, 0, 0, 6);
  world.addBox(3, 5, 2, 0.5, 0, 0, 6);
  world.addCircle(0, 5, 0.5, 0, 0.8);
  assert.equal(world.hasLineOfSight({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 10 }), true);
  assert.equal(world.hasLineOfSight({ x: 0, y: 0.4, z: 0 }, { x: 0, y: 0.4, z: 10 }), false);
  assert.equal(world.hasLineOfSight({ x: 3, y: 1.4, z: 0 }, { x: 3, y: 1.4, z: 10 }), false);
});

test('rotated thin walls cannot be skipped by a long segment or discrete samples', () => {
  const world = new CollisionWorld();
  const angle = Math.PI / 4;
  world.addBox(0, 0, 4, 0.002, angle, 0, 4);
  const from = { x: -5, y: 2, z: -5 }, to = { x: 5, y: 2, z: 5 };
  assert.ok(Math.abs(world.obstructionDistance(from, to) - (Math.sqrt(50) - 0.002)) < 1e-8);
  assert.equal(world.hasLineOfSight(from, to), false);
});

test('legacy unbounded geometry blocks combat without changing the existing camera sweep', () => {
  const world = new CollisionWorld();
  world.addBox(0, 5, 1, 0.5);
  const from = { x: 0, y: 2, z: 0 }, to = { x: 0, y: 2, z: 10 };
  assert.equal(world.obstructionDistance(from, to), 4.5);
  assert.equal(world.hasLineOfSight(from, to), false);
  assert.equal(world.cameraDistance(from, to), 10);
});

test('vertical rays and origins inside colliders are obstructed correctly', () => {
  const world = new CollisionWorld();
  world.addCircle(0, 0, 1, 2, 4);
  assert.equal(world.obstructionDistance({ x: 0, y: 6, z: 0 }, { x: 0, y: 0, z: 0 }), 2);
  assert.equal(world.obstructionDistance({ x: 0, y: 3, z: 0 }, { x: 0, y: 3, z: 5 }), 0);
  assert.equal(world.hasLineOfSight({ x: 2, y: 6, z: 0 }, { x: 2, y: 0, z: 0 }), true);
});
