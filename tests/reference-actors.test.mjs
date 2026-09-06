import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

function readAsset(path) {
  const bytes = fs.readFileSync(new URL(`../public/assets/models/${path}`, import.meta.url));
  const glb = path.endsWith('.glb');
  const doc = JSON.parse(glb ? bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString() : bytes.toString());
  const buffers = glb ? [bytes.subarray(28 + bytes.readUInt32LE(12))]
    : doc.buffers.map(b => Buffer.from(b.uri.split(',')[1], 'base64'));
  function accessor(index) {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const kind = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] }[a.componentType];
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? width * kind[1];
    return Array.from({ length: a.count }, (_, row) => Array.from({ length: width }, (_, col) =>
      buffers[v.buffer][kind[0]](start + row * stride + col * kind[1])));
  }
  return { doc, accessor };
}

function local(node) {
  return node.matrix ? Matrix.FromArray(node.matrix) : Matrix.Compose(
    Vector3.FromArray(node.scale ?? [1, 1, 1]), Quaternion.FromArray(node.rotation ?? [0, 0, 0, 1]),
    Vector3.FromArray(node.translation ?? [0, 0, 0]));
}
function worlds(doc) {
  const parents = new Map(doc.nodes.flatMap((node, parent) => (node.children ?? []).map(child => [child, parent])));
  const output = new Map();
  function get(i) {
    if (!output.has(i)) output.set(i, parents.has(i) ? local(doc.nodes[i]).multiply(get(parents.get(i))) : local(doc.nodes[i]));
    return output.get(i);
  }
  doc.nodes.forEach((_, i) => get(i));
  return output;
}

const pairs = [
  ['knight', 'characters/Warrior.gltf', 'reference/Knight_Reference.gltf', 13],
  ['wolf', 'monsters-glb/Fox.glb', 'reference/Grey_Wolf_Reference.gltf', 3],
];

for (const [name, sourcePath, derivativePath, count] of pairs) {
  test(`reference ${name}: all source clips retain timing, rotation and scale; translations follow the new rest pose`, () => {
    const source = readAsset(sourcePath), result = readAsset(derivativePath);
    assert.equal(result.doc.animations.length, count);
    for (let ai = 0; ai < count; ai++) {
      const before = source.doc.animations[ai], after = result.doc.animations[ai];
      assert.equal(after.name, before.name);
      assert.equal(after.channels.length, before.channels.length);
      for (let ci = 0; ci < before.channels.length; ci++) {
        const bc = before.channels[ci], ac = after.channels[ci];
        assert.deepEqual(ac.target, bc.target);
        const bs = before.samplers[bc.sampler], as = after.samplers[ac.sampler];
        assert.deepEqual(result.accessor(as.input), source.accessor(bs.input));
        const bv = source.accessor(bs.output), av = result.accessor(as.output);
        if (bc.target.path !== 'translation') assert.deepEqual(av, bv);
        else {
          const oldRest = local(source.doc.nodes[bc.target.node]).getTranslation();
          const newRest = local(result.doc.nodes[ac.target.node]).getTranslation();
          const delta = newRest.subtract(oldRest).asArray();
          for (let key = 0; key < bv.length; key++) for (let axis = 0; axis < 3; axis++)
            assert.ok(Math.abs(av[key][axis] - bv[key][axis] - delta[axis]) < 0.00002,
              `${name}/${before.name}/${ci}: translation delta must preserve the animated trajectory`);
        }
      }
    }
  });

  test(`reference ${name}: inverse binds preserve the source bone orientation, including posed default nodes`, () => {
    const source = readAsset(sourcePath), sourceWorld = worlds(source.doc);
    const asset = readAsset(derivativePath), { doc, accessor } = asset;
    const world = worlds(doc);
    for (let si = 0; si < doc.skins.length; si++) {
      const skin = doc.skins[si], meshNode = doc.nodes.findIndex(node => node.skin === si);
      const bind = accessor(skin.inverseBindMatrices);
      const sourceBind = source.accessor(source.doc.skins[si].inverseBindMatrices);
      skin.joints.forEach((joint, ji) => {
        const restored = Matrix.FromArray(bind[ji]).multiply(world.get(joint));
        const expected = Matrix.FromArray(sourceBind[ji]).multiply(sourceWorld.get(joint));
        // Warrior defaults are already posed. Replacing inverse binds with
        // inverse(default nodes) silently corrupts the arms in running/attack.
        for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10])
          assert.ok(Math.abs(restored.m[i] - expected.m[i]) < 0.00005,
            `${name}/${doc.nodes[joint].name}: source pose orientation must survive the proportional remap`);
        assert.ok(Matrix.FromArray(bind[ji]).determinant() > 0.000001);
      });
    }
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      const attributes = primitive.attributes;
      for (const key of ['POSITION', 'NORMAL', 'WEIGHTS_0', 'COLOR_0']) if (key in attributes)
        assert.ok(accessor(attributes[key]).flat().every(Number.isFinite), `${name}/${key} finite`);
      for (const normal of accessor(attributes.NORMAL)) assert.ok(Math.abs(Math.hypot(...normal) - 1) < 0.0001);
      if ('COLOR_0' in attributes) assert.ok(accessor(attributes.COLOR_0).flat().every(v => v >= 0 && v <= 1));
    }
  });
}

test('knight reference changes proportions and separates metal from leather while keeping the original texture images', () => {
  const source = readAsset(pairs[0][1]), result = readAsset(pairs[0][2]);
  assert.deepEqual(result.doc.images, source.doc.images);
  const sourceFace = source.accessor(source.doc.meshes[1].primitives[0].attributes.POSITION);
  const resultFace = result.accessor(result.doc.meshes[1].primitives[0].attributes.POSITION);
  const height = points => Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
  assert.ok(height(resultFace) / height(sourceFace) < 0.65);
  const sourceHips = source.doc.nodes.find(n => n.name === 'Body').translation[1];
  const resultHips = result.doc.nodes.find(n => n.name === 'Body').translation[1];
  assert.ok(resultHips / sourceHips > 1.20);
  const steel = result.doc.materials.find(m => m.name === 'Reference tempered steel').pbrMetallicRoughness;
  const leather = result.doc.materials.find(m => m.name === 'Reference worn leather and cloth').pbrMetallicRoughness;
  assert.ok(steel.metallicFactor > .6 && leather.metallicFactor === 0 && steel.roughnessFactor < leather.roughnessFactor);
});

test('wolf coat keeps the original texture mapping so eyes and muzzle survive the grey shader', () => {
  const source = readAsset(pairs[1][1]), result = readAsset(pairs[1][2]);
  assert.deepEqual(result.doc.images, source.doc.images);
  assert.deepEqual(result.doc.textures, source.doc.textures);
  assert.deepEqual(result.doc.materials[0].pbrMetallicRoughness.baseColorTexture,
    source.doc.materials[0].pbrMetallicRoughness.baseColorTexture);
  for (let i = 0; i < source.doc.meshes.length; i++) {
    const before = source.doc.meshes[i].primitives[0].attributes;
    const after = result.doc.meshes[i].primitives[0].attributes;
    assert.deepEqual(result.accessor(after.TEXCOORD_0), source.accessor(before.TEXCOORD_0));
    assert.equal(after.COLOR_0, undefined, 'lossy vertex mask must not replace painted face detail');
  }
});
