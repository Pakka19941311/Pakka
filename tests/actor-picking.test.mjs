import assert from 'node:assert/strict';
import test from 'node:test';
import { Bone, FreeCamera, Matrix, Mesh, MeshBuilder, NullEngine, Scene, Skeleton, Space, Vector3, VertexBuffer } from '@babylonjs/core';
import { pickVisibleActor } from '../src/controls/actor-picking.ts';

function fixture() {
  const engine = new NullEngine({ renderWidth: 800, renderHeight: 600 });
  const scene = new Scene(engine);
  const camera = new FreeCamera('camera', new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  scene.updateTransformMatrix(true);
  return { engine, scene, camera,
    screen: point => Vector3.Project(point, Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(800, 600)),
    dispose: () => { scene.dispose(); engine.dispose(); } };
}

test('exact triangles choose the nearer live actor without letting an oversized proxy steal its click', () => {
  const f = fixture();
  try {
    const proxy = MeshBuilder.CreateBox('obsolete-proxy', { size: 5 }, f.scene);
    proxy.position.z = -4;
    const back = MeshBuilder.CreatePlane('back', { size: 2, sideOrientation: Mesh.DOUBLESIDE }, f.scene);
    back.position.z = 2; back.metadata = { alive: true };
    const front = MeshBuilder.CreatePlane('front', { size: 2, sideOrientation: Mesh.DOUBLESIDE }, f.scene);
    front.metadata = { alive: true }; front.isPickable = false;
    const filter = mesh => mesh.metadata?.alive === true;
    assert.equal(pickVisibleActor(f.scene, f.camera, 400, 300, filter)?.pickedMesh?.name, front.name);
    front.metadata.alive = false;
    assert.equal(pickVisibleActor(f.scene, f.camera, 400, 300, filter)?.pickedMesh?.name, back.name);
    const empty = f.screen(new Vector3(1.8, 0, 0));
    assert.equal(pickVisibleActor(f.scene, f.camera, empty.x, empty.y, filter), null);
  } finally { f.dispose(); }
});

test('a skinned actor is picked at its current bone pose and no longer at its bind pose', () => {
  const f = fixture();
  try {
    const actor = MeshBuilder.CreatePlane('skinned-actor', { size: 1, sideOrientation: Mesh.DOUBLESIDE }, f.scene);
    const skeleton = new Skeleton('rig', 'rig', f.scene);
    const bone = new Bone('body', skeleton, null, Matrix.Identity());
    const count = actor.getTotalVertices();
    actor.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(count * 4));
    const weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex++) weights[vertex * 4] = 1;
    actor.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
    actor.skeleton = skeleton;
    const filter = mesh => mesh === actor;
    assert.equal(pickVisibleActor(f.scene, f.camera, 400, 300, filter)?.pickedMesh?.name, actor.name);
    bone.setPosition(new Vector3(3, 0, 0), Space.LOCAL);
    const moved = f.screen(new Vector3(3, 0, 0));
    assert.equal(pickVisibleActor(f.scene, f.camera, moved.x, moved.y, filter)?.pickedMesh?.name, actor.name);
    assert.equal(pickVisibleActor(f.scene, f.camera, 400, 300, filter), null);
    bone.setPosition(new Vector3(-3, 0, 0), Space.LOCAL);
    const movedAgain = f.screen(new Vector3(-3, 0, 0));
    assert.equal(pickVisibleActor(f.scene, f.camera, movedAgain.x, movedAgain.y, filter)?.pickedMesh?.name, actor.name);
    assert.equal(pickVisibleActor(f.scene, f.camera, moved.x, moved.y, filter), null);
  } finally { f.dispose(); }
});

test('hidden and disabled actor geometry cannot intercept a visible actor', () => {
  const f = fixture();
  try {
    const visible = MeshBuilder.CreatePlane('visible', { size: 2, sideOrientation: Mesh.DOUBLESIDE }, f.scene);
    for (const mode of ['hidden', 'disabled', 'transparent']) {
      const hidden = MeshBuilder.CreatePlane(mode, { size: 3, sideOrientation: Mesh.DOUBLESIDE }, f.scene);
      hidden.position.z = -2;
      if (mode === 'hidden') hidden.isVisible = false;
      if (mode === 'disabled') hidden.setEnabled(false);
      if (mode === 'transparent') hidden.visibility = 0;
    }
    assert.equal(pickVisibleActor(f.scene, f.camera, 400, 300, () => true)?.pickedMesh?.name, visible.name);
  } finally { f.dispose(); }
});
