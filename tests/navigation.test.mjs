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

test('a valid click beside a wall stays reachable when its grid cell rounds inside the wall', () => {
  const world = new CollisionWorld(); world.addBox(0, 0, 1, 3);
  for (const x of [1.47, 1.5, 1.6, 1.7]) for (const margin of [9, 10, 24]) {
    const start = { x: -4, z: 0 }, goal = { x, z: 0 };
    assert.equal(world.isBlocked(goal, 0.46), false);
    const path = findNavigationPath(world, start, goal, { actorRadius: 0.46, cellSize: 0.85, margin });
    assert.ok(path.length > 0, `false unreachable ${x}/${margin}`);
    let cursor = start;
    for (const point of path) { assert.equal(pathSegmentIsClear(world, cursor, point, 0.46), true); cursor = point; }
    assert.deepEqual(path.at(-1), goal);
  }
});
