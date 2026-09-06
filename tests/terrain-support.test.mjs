import assert from 'node:assert/strict';
import test from 'node:test';
import { TerrainSurface } from '../src/world/terrain-surface.ts';

test('support follows the actual ground triangles across hills, diagonals and map edges', () => {
  const terrain = new TerrainSurface();
  for (let row = 0; row < 140; row += 7) for (let col = 0; col < 140; col += 9) {
    const a = terrain.vertex(col, row), b = terrain.vertex(col + 1, row);
    const c = terrain.vertex(col, row + 1), d = terrain.vertex(col + 1, row + 1);
    for (const triangle of [[a, b, d], [a, c, d]]) {
      const p = { x: 0, y: 0, z: 0 };
      triangle.forEach((v, i) => { const w = [0.2, 0.3, 0.5][i]; p.x += v.x * w; p.y += v.y * w; p.z += v.z * w; });
      assert.ok(Math.abs(terrain.supportAt(p.x, p.z) - p.y) < 1e-6);
    }
  }
  assert.equal(terrain.supportAt(-7, -11), 0);
  assert.equal(terrain.supportAt(-18, -11), 0);
  terrain.addPlatform(-18, -11, 5.8, 4.4, 0.16);
  assert.equal(terrain.supportAt(-18, -11), 0.16);
});

test('crossed roads partition one terrain surface without overlap, holes or buried road planes', () => {
  const terrain = new TerrainSurface();
  terrain.addRoad(-7, -5, 5.2, 35);
  terrain.addRoad(-7, -5, 27, 4.4);
  terrain.addRoad(24, 32, 90, 4.8, 0.63);
  terrain.addRoad(-7, -5, 12.5, 11);
  const { positions, groundIndices, roadIndices } = terrain.geometry();
  const vertex = id => ({ x: positions[id * 3], y: positions[id * 3 + 1], z: positions[id * 3 + 2] });
  let totalArea = 0; let roadArea = 0;
  for (const indices of [groundIndices, roadIndices]) for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map(vertex);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    totalArea += area; if (indices === roadIndices) roadArea += area;
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    assert.ok(Math.abs(terrain.heightAt(x, z) - (a.y + b.y + c.y) / 3) < 1e-5);
    assert.equal(terrain.roadAt(x, z), indices === roadIndices);
  }
  assert.ok(Math.abs(totalArea - 320 * 280) < 1e-4, `ground area ${totalArea}`);
  assert.ok(roadArea > 500 && roadArea < 1000);
});
