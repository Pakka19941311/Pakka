import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, NullEngine, Scene, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import { buildConiferGeometry, createConiferSources, coniferSourceForName, CONIFER_LOD_DISTANCE } from '../src/rendering/conifer-geometry.ts';

test('three instanced conifers keep branch silhouettes, upright normals and bounded near/far geometry', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const material = new StandardMaterial('test-pine', scene);
    const sources = createConiferSources(scene, material, material);
    assert.equal(sources.length, 3);
    const variants = new Set();
    for (let template = 0; template < sources.length; template += 1) {
      const high = buildConiferGeometry(template), low = buildConiferGeometry(template, 'far');
      assert.deepEqual(buildConiferGeometry(template), high, 'World reload keeps the same silhouette');
      variants.add(JSON.stringify(high.needles.positions));
      assert.equal(high.branchCount, low.branchCount, 'LOD retains each radial bough');
      assert.ok(high.branchCount >= 30, 'Individual branches replace the old five solid layers');
      for (const [detail, maximum] of [[high, 3000], [low, 500]]) {
        let triangles = 0, minY = Infinity, maxY = -Infinity;
        for (const buffer of [detail.wood, detail.needles]) {
          triangles += buffer.indices.length / 3;
          assert.equal(buffer.uvs.length, buffer.positions.length / 3 * 2);
          assert.equal(buffer.colors.length, buffer.positions.length / 3 * 4);
          assert.ok(buffer.positions.every(Number.isFinite));
          assert.ok(buffer.indices.every(i => Number.isInteger(i) && i >= 0 && i < buffer.positions.length / 3));
          for (let i = 0; i < buffer.positions.length; i += 3) {
            assert.ok(Math.hypot(buffer.positions[i], buffer.positions[i + 2]) < 0.31, 'Crown stays inside the existing roadside footprint');
            minY = Math.min(minY, buffer.positions[i + 1]); maxY = Math.max(maxY, buffer.positions[i + 1]);
          }
        }
        assert.ok(triangles <= maximum, `${triangles} triangles exceed ${maximum}`);
        assert.ok(minY > -0.001 && maxY >= 0.99 && maxY < 1.01, 'One normalized metre, grounded without a floating canopy');
      }
      const source = sources[template];
      assert.ok(source.crown.getVerticesData(VertexBuffer.NormalKind)[1] > 0.9, 'Needle tops face the light, not the interior');
      assert.ok(source.trunk.getVerticesData(VertexBuffer.NormalKind)[2] < 0, 'Bark faces outwards');
      assert.equal(source.trunk.isVisible, false);
      assert.equal(source.crown.isVisible, false);
      const instance = source.crown.createInstance(`tree-${template}`);
      instance.position.set(200, 0, 0); instance.scaling.setAll(8); instance.isVisible = true;
      instance.computeWorldMatrix(true);
      const center = instance.getBoundingInfo().boundingSphere.centerWorld;
      const camera = new FreeCamera('camera', center.add(new Vector3(0, 0, 10)), scene);
      camera.getViewMatrix();
      assert.equal(instance.getLOD(camera), source.crown, 'LOD uses the visible instance position');
      camera.position.copyFrom(center.add(new Vector3(0, 0, CONIFER_LOD_DISTANCE + 10))); camera.getViewMatrix();
      assert.equal(instance.getLOD(camera), source.crown.getLODLevelAtDistance(CONIFER_LOD_DISTANCE));
      camera.dispose(); instance.dispose();
    }
    assert.equal(variants.size, 3, 'Three genuinely different branch layouts');
    assert.equal(coniferSourceForName('pine-42', sources), coniferSourceForName('pine-42', sources));
  } finally { scene.dispose(); engine.dispose(); }
});
