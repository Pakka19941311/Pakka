import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, NullEngine, Scene } from '@babylonjs/core';
import { createLivingFire } from '../src/rendering/living-fire.ts';

test('living fire uses a shared transparent shader, bounded geometry and moving embers', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const fire = createLivingFire(scene, 'test-fire', { x: 3, y: 0.8, z: -4, scale: 0.7 });
    assert.equal(fire.flames.length, 3);
    assert.equal(fire.embers.length, 6);
    const meshes = [...fire.flames, ...fire.embers];
    assert.equal(meshes.reduce((count, mesh) => count + mesh.getTotalIndices() / 3, 0), 18);
    const material = fire.flames[0].material;
    assert.equal(material.needAlphaBlending(), true);
    assert.equal(material.disableDepthWrite, true);
    for (const mesh of meshes) {
      assert.equal(mesh.material, material);
      assert.equal(mesh.isPickable, false);
      assert.equal(mesh.checkCollisions, false);
      assert.ok(Number.isFinite(mesh.position.y));
    }
    assert.equal(fire.flames[0].billboardMode, Mesh.BILLBOARDMODE_Y);
    const initial = fire.embers[0].position.clone();
    fire.update(0.1);
    assert.ok(fire.embers[0].position.y > initial.y);
    assert.notEqual(fire.embers[0].position.x, initial.x);
    const next = fire.embers[0].position.clone();
    fire.update(Number.NaN);
    fire.update(-1);
    assert.deepEqual(fire.embers[0].position, next);
    fire.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test('disposing one fire removes only its resources and render observer; scene disposal removes the rest', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const before = scene.onBeforeRenderObservable.observers.length;
    const fire = createLivingFire(scene, 'one', { x: 0, y: 0, z: 0 });
    const neighbour = createLivingFire(scene, 'two', { x: 4, y: 0, z: 0 });
    assert.equal(scene.onBeforeRenderObservable.observers.length, before + 2);
    fire.dispose();
    fire.dispose();
    fire.update(0.1);
    assert.ok(fire.flames.every(mesh => mesh.isDisposed()));
    assert.ok(fire.embers.every(mesh => mesh.isDisposed()));
    assert.ok(neighbour.flames.every(mesh => !mesh.isDisposed()));
    assert.equal(scene.meshes.length, 9);
    assert.equal(scene.materials.length, 1);
    assert.equal(scene.onBeforeRenderObservable.observers.filter(observer => !observer._willBeUnregistered).length, before + 1);
    scene.dispose();
    assert.ok(neighbour.flames.every(mesh => mesh.isDisposed()));
    assert.ok(neighbour.embers.every(mesh => mesh.isDisposed()));
  } finally { scene.dispose(); engine.dispose(); }
});
