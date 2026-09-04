import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld } from '../src/world/collision-world.ts';

test('player is blocked by large static geometry and slides along it', () => {
  const world = new CollisionWorld();
  world.addBox(2, 0, 0.7, 2, 0);
  const blocked = world.resolve({ x: 0, z: 0 }, { x: 1.5, z: 0 }, 0.5);
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.x > 0.79 && blocked.x <= 0.8, 'advance up to the wall instead of stopping early');
  assert.equal(blocked.z, 0);
  const slide = world.resolve({ x: 0, z: 0 }, { x: 1.5, z: 0.5 }, 0.5);
  assert.equal(slide.blocked, true);
  assert.ok(slide.z > 0);
});

test('glancing movement follows rotated walls and deep overlap recovers without locking input', () => {
  const world = new CollisionWorld();
  const angle = 0.61; world.addBox(0, 0, 8, 0.25, angle);
  let point = { x: -Math.sin(angle), z: -Math.cos(angle) };
  for (let i = 0; i < 80; i++) {
    point = world.resolve(point, { x: Math.cos(angle) * 0.05 + Math.sin(angle) * 0.03, z: -Math.sin(angle) * 0.05 + Math.cos(angle) * 0.03 }, 0.46);
    assert.equal(world.isBlocked(point, 0.46), false);
  }
  assert.ok(Math.hypot(point.x, point.z) > 3, 'tangent movement must not stall');
  const recovered = world.resolve({ x: 0, z: 0 }, { x: 0.05, z: 0 }, 0.46);
  assert.equal(world.isBlocked(recovered, 0.46), false);
});

test('a long step cannot tunnel through a thin fence', () => {
  const world = new CollisionWorld(); world.addBox(0, 0, 5, 0.05);
  const moved = world.resolve({ x: 0, z: -3 }, { x: 0, z: 8 }, 0.42);
  assert.ok(moved.z < -0.46); assert.equal(moved.blocked, true);
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
