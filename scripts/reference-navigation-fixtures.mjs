// Run against an unmodified checkout of the user-approved browser build:
// node --experimental-strip-types scripts/reference-navigation-fixtures.mjs /path/to/reference > godot-pc/tests/reference-navigation.json
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(process.argv[2]);
const { CollisionWorld } = await import(pathToFileURL(resolve(root, 'src/world/collision-world.ts')));
const { findNavigationPath, pathSegmentIsClear } = await import(pathToFileURL(resolve(root, 'src/world/navigation.ts')));
const box = (x, z, halfX, halfZ, rotation = 0) => ({ kind: 'box', x, z, halfX, halfZ, rotation });
const point = (x, z) => ({ x, z });
const cases = [
  { name: 'clear_ground', obstacles: [], start: point(0, 0), goal: point(5, 2) },
  { name: 'building_detour', obstacles: [box(0, 0, 1.2, 3.2)], start: point(-5, 0), goal: point(5, 0) },
  { name: 'reference_test_building_detour', obstacles: [box(0, 0, 1.2, 3.2)], start: point(-5, 0), goal: point(5, 0), radius: .45, options: { cellSize: .8 } },
  { name: 'open_gate', obstacles: [box(-4, 0, 2.5, .5), box(4, 0, 2.5, .5)], start: point(0, -4), goal: point(0, 4) },
  { name: 'rotated_house', obstacles: [box(0, 0, 1.5, 3.2, .4)], start: point(-5, -1), goal: point(5, 2) },
  { name: 'round_obstacle', obstacles: [{ kind: 'circle', x: 0, z: 0, radius: 2 }], start: point(-5, 0), goal: point(5, 0) },
  { name: 'blocked_click_projected_free', obstacles: [box(0, 0, 1.2, 3.2)], start: point(-5, 0), goal: point(0, 0) },
  { name: 'enclosed_goal', obstacles: [box(0, -2, 2.5, .3), box(0, 2, 2.5, .3), box(-2, 0, .3, 2.5), box(2, 0, .3, 2.5)], start: point(-5, 0), goal: point(0, 0) },
  { name: 'visited_budget_fails_closed', obstacles: [box(0, 0, 1.2, 3.2)], start: point(-5, 0), goal: point(5, 0), options: { maxVisited: 1 } },
];
for (const x of [1.47, 1.5, 1.6, 1.7]) for (const margin of [9, 10, 24]) {
  cases.push({ name: `wall_adjacent_${x}_${margin}`, obstacles: [box(0, 0, 1, 3)], start: point(-4, 0), goal: point(x, 0), options: { cellSize: .85, margin } });
}
for (const item of cases) {
  const world = new CollisionWorld();
  for (const o of item.obstacles) {
    if (o.kind === 'circle') world.addCircle(o.x, o.z, o.radius);
    else world.addBox(o.x, o.z, o.halfX, o.halfZ, o.rotation);
  }
  item.radius ??= .46;
  item.options ??= {};
  item.path = findNavigationPath(world, item.start, item.goal, { actorRadius: item.radius, ...item.options });
  let cursor = world.findNearestFree(item.start, item.radius);
  item.referenceSegmentsClear = item.path.every(waypoint => {
    const clear = pathSegmentIsClear(world, cursor, waypoint, item.radius);
    cursor = waypoint;
    return clear;
  });
}
console.log(JSON.stringify({ referenceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), cases }, null, 2));
