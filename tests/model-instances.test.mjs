import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, Scene, AssetContainer, MeshBuilder, PBRMaterial, MultiMaterial, Skeleton, Bone, Matrix, AnimationGroup, TransformNode } from '@babylonjs/core';
import { ModelInstances } from '../src/rendering/model-instances.ts';

test('fifty respawns preserve shared materials, template MultiMaterial links and independent rigs', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox('test-template', {}, scene);
    const pbr = new PBRMaterial('body', scene);
    const multi = new MultiMaterial('parts', scene); multi.subMaterials = [pbr]; mesh.material = multi;
    const skeleton = new Skeleton('rig', 'rig', scene);
    new Bone('root', skeleton, null, Matrix.Identity()); mesh.skeleton = skeleton;
    container.meshes = [mesh]; container.materials = [pbr]; container.multiMaterials = [multi];
    container.skeletons = [skeleton]; container.animationGroups = [new AnimationGroup('idle', scene)];
    container.removeAllFromScene();
    const factory = new ModelInstances();
    const survivor = factory.create(container, 'survivor', 0xccbbaa);
    const survivorMesh = survivor.root.getChildMeshes()[0];
    const material = survivorMesh.material;
    const counts = () => [scene.meshes.length, scene.materials.length, scene.multiMaterials.length, scene.skeletons.length, scene.animationGroups.length];
    const initial = counts();
    for (let i = 0; i < 50; i++) {
      const actor = factory.create(container, `respawn-${i}`, 0xccbbaa);
      const child = actor.root.getChildMeshes()[0];
      assert.equal(child.material, material);
      assert.notEqual(child.skeleton, survivorMesh.skeleton);
      child.scaling.setAll(2); child.position.x = 5;
      actor.dispose(); actor.dispose();
      assert.deepEqual(counts(), initial);
      assert.equal(survivorMesh.isDisposed(), false);
      assert.equal(multi.subMaterials[0], pbr);
      assert.equal(mesh.scaling.x, 1); assert.equal(mesh.position.x, 0);
    }
    survivor.dispose(); container.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test('cloned rig returns to rest without changing template pose or another actor', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox('body', {}, scene);
    const joint = new TransformNode('joint', scene); joint.parent = mesh; joint.position.y = 9;
    const rig = new Skeleton('rig', 'rig', scene); mesh.skeleton = rig;
    const bone = new Bone('joint', rig, null, Matrix.Translation(0, 1, 0)); bone.linkTransformNode(joint);
    container.meshes = [mesh]; container.transformNodes = [joint]; container.skeletons = [rig];
    container.removeAllFromScene();
    const factory = new ModelInstances();
    const first = factory.create(container, 'one');
    const firstJoint = first.root.getChildMeshes()[0].skeleton.bones[0].getTransformNode();
    assert.notEqual(firstJoint, joint); assert.equal(firstJoint.position.y, 1);
    firstJoint.position.y = 5;
    const second = factory.create(container, 'two');
    assert.equal(firstJoint.position.y, 5); assert.equal(joint.position.y, 9);
    assert.equal(second.root.getChildMeshes()[0].skeleton.bones[0].getTransformNode().position.y, 1);
    first.dispose(); second.dispose(); container.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});
