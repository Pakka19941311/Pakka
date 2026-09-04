import assert from 'node:assert/strict';
import test from 'node:test';
import { SPAWN_REGIONS, patrolRouteInRegion, spawnPointInRegion } from '../src/world/spawn-regions.ts';

test('monster territories are thematic, distributed and population capped', () => {
  assert.ok(SPAWN_REGIONS.length >= 9);
  const ordinary = SPAWN_REGIONS.filter((region) => !region.boss);
  assert.equal(new Set(ordinary.map((region) => region.monsterId)).size, ordinary.length);
  assert.ok(ordinary.every((region) => region.population >= 5 && region.population <= 8));
  assert.ok(Math.max(...ordinary.map((region) => region.center.x)) - Math.min(...ordinary.map((region) => region.center.x)) > 80);
});

test('spawn and patrol points remain inside their authored territory', () => {
  for (const region of SPAWN_REGIONS) {
    for (let index = 0; index < region.population; index += 1) {
      const spawn = spawnPointInRegion(region, index);
      assert.ok(Math.hypot(spawn.x - region.center.x, spawn.z - region.center.z) <= region.radius + 0.001);
      for (const point of patrolRouteInRegion(region, spawn, index)) {
        const limit = region.radius > 0 ? region.radius + region.patrolRadius * 0.45 : region.patrolRadius;
        assert.ok(Math.hypot(point.x - region.center.x, point.z - region.center.z) <= limit + 0.001);
      }
    }
  }
});
