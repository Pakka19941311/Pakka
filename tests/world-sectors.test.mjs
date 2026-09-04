import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldSectorGrid } from '../src/world/world-sectors.ts';

test('large world sectors are stable across negative and positive coordinates', () => {
  const grid = new WorldSectorGrid(48);
  assert.equal(grid.keyAt(0, 0), '0:0');
  assert.equal(grid.keyAt(-1, -1), '-1:-1');
  assert.equal(grid.keyAt(96, 47), '2:0');
  const nearby = grid.activeKeysAround(0, 0, 70);
  assert.ok(nearby.has('0:0'));
  assert.ok(nearby.has('-1:0'));
  assert.ok(!nearby.has('5:5'));
});
