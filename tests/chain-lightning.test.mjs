import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveChainLightning } from '../src/combat/chain-lightning.ts';

const unit = (uid, x, z, alive = true) => ({ uid, x, z, alive });

test('Chain Lightning walks nearest valid targets without repeats', () => {
  const primary = unit('primary', 0, 0);
  const hits = resolveChainLightning(primary, [
    primary,
    unit('a', 3, 0),
    unit('b', 8, 0),
    unit('c', 13, 0),
    unit('d', 18, 0),
    unit('too-far', 40, 0),
  ], { maxTargets: 5, radius: 6.5, falloff: 0.76 });
  assert.deepEqual(hits.map((hit) => hit.target.uid), ['primary', 'a', 'b', 'c', 'd']);
  assert.equal(new Set(hits.map((hit) => hit.target.uid)).size, hits.length);
  assert.deepEqual(hits.map((hit) => Number(hit.multiplier.toFixed(4))), [1, 0.76, 0.5776, 0.439, 0.3336]);
  assert.deepEqual(hits.slice(1).map((hit) => hit.source?.uid), ['primary', 'a', 'b', 'c']);
});

test('Chain Lightning skips dead and disconnected targets', () => {
  const primary = unit('primary', 0, 0);
  const hits = resolveChainLightning(primary, [unit('dead', 2, 0, false), unit('isolated', 7, 0)], {
    maxTargets: 5,
    radius: 6.5,
    falloff: 0.76,
  });
  assert.deepEqual(hits.map((hit) => hit.target.uid), ['primary']);
});
