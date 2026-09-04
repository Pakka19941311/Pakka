import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { findNavigationPath, pathSegmentIsClear } from '../src/world/navigation.ts';

test('navigation returns a direct destination through clear terrain', () => {
  const world = new CollisionWorld();
  assert.deepEqual(findNavigationPath(world, { x: 0, z: 0 }, { x: 5, z: 2 }), [{ x: 5, z: 2 }]);
});

test('navigation routes around a building instead of crossing its collider', () => {
  const world = new CollisionWorld();
  world.addBox(0, 0, 1.2, 3.2);
  const start = { x: -5, z: 0 };
  const goal = { x: 5, z: 0 };
  const path = findNavigationPath(world, start, goal, { actorRadius: 0.45, cellSize: 0.8 });
  assert.ok(path.length >= 2);
  let cursor = start;
  for (const waypoint of path) {
    assert.equal(pathSegmentIsClear(world, cursor, waypoint, 0.45), true);
    cursor = waypoint;
  }
  assert.deepEqual(path.at(-1), goal);
  assert.ok(path.some((point) => Math.abs(point.z) > 3.2));
});

test('navigation preserves an open gate between two wall segments', () => {
  const world = new CollisionWorld();
  world.addBox(-4, 0, 2.5, 0.5);
  world.addBox(4, 0, 2.5, 0.5);
  const path = findNavigationPath(world, { x: 0, z: -4 }, { x: 0, z: 4 }, { actorRadius: 0.45 });
  assert.deepEqual(path, [{ x: 0, z: 4 }]);
});
