import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld } from '../src/world/collision-world.ts';

test('player is blocked by large static geometry and slides along it', () => {
  const world = new CollisionWorld();
  world.addBox(2, 0, 0.7, 2, 0);
  const blocked = world.resolve({ x: 0, z: 0 }, { x: 1.5, z: 0 }, 0.5);
  assert.equal(blocked.blocked, true);
  assert.deepEqual({ x: blocked.x, z: blocked.z }, { x: 0, z: 0 });
  const slide = world.resolve({ x: 0, z: 0 }, { x: 1.5, z: 0.5 }, 0.5);
  assert.equal(slide.blocked, true);
  assert.ok(slide.z > 0);
});

test('rotated obstacles and tree trunks reject overlapping actors', () => {
  const world = new CollisionWorld();
  world.addCircle(0, 0, 1);
  world.addBox(5, 0, 2, 0.5, Math.PI / 4);
  assert.equal(world.isBlocked({ x: 1.3, z: 0 }, 0.4), true);
  assert.equal(world.isBlocked({ x: 5, z: 0 }, 0.4), true);
  assert.equal(world.isBlocked({ x: 8, z: 0 }, 0.4), false);
});

test('spawn recovery finds a nearby free point instead of trapping an actor', () => {
  const world = new CollisionWorld();
  world.addCircle(0, 0, 1.5);
  const free = world.findNearestFree({ x: 0, z: 0 }, 0.5);
  assert.equal(world.isBlocked(free, 0.5), false);
  assert.ok(Math.hypot(free.x, free.z) <= 3.2);
});
