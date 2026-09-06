import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import '@babylonjs/loaders/glTF/index.js';
import { NullEngine, Scene, SceneLoader, Vector3, VertexBuffer } from '@babylonjs/core';
import { createStaticPart } from '../src/rendering/static-part.ts';
import { createGabledRoof } from '../src/rendering/gabled-roof.ts';
import { greenfallFortLayout, registerFortPartCollider } from '../src/world/greenfall-layout.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { pathSegmentIsClear } from '../src/world/navigation.ts';

test('shipped fort geometry faces the street, has a measured opening and fits its declared footprint', async () => {
  const base = new URL('../public/assets/models/realism/modular_fort_01/', import.meta.url);
  const gltf = JSON.parse(await readFile(new URL('modular_fort_01_1k.gltf', base), 'utf8'));
  // Exact shipped vertex/index bytes; material loading is covered by the asset gate.
  gltf.buffers[0].uri = 'data:application/octet-stream;base64,' + (await readFile(new URL('modular_fort_01.bin', base))).toString('base64');
  delete gltf.images; delete gltf.textures; delete gltf.materials;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const container = await SceneLoader.LoadAssetContainerAsync('', 'data:' + JSON.stringify(gltf), scene, undefined, '.gltf');
    const wall = createStaticPart(container, 'wall_thin_straight_01', 'wall', 4.8);
    assert.ok(wall.size.x > 8.2 && wall.size.x < 8.3);
    assert.ok(wall.size.z > 1.4 && wall.size.z < 1.5);
    wall.root.dispose(false, false);
    const gate = createStaticPart(container, 'wall_thin_gate_01', 'gate', 5.6, {width: 7.2, depth: 1.75});
    gate.root.computeWorldMatrix(true); gate.meshes.forEach(m => m.computeWorldMatrix(true));
    const bounds = gate.root.getHierarchyBoundingVectors(true);
    for (const [axis, size] of [['x',7.2],['y',5.6],['z',1.75]]) assert.ok(Math.abs(bounds.max[axis] - bounds.min[axis] - size) < .001);
    const spans = [];
    for (const mesh of gate.meshes) {
      const source = mesh.getVerticesData(VertexBuffer.PositionKind), indices = mesh.getIndices();
      const vertices = [];
      for (let i=0; i<source.length; i+=3) vertices.push(Vector3.TransformCoordinates(Vector3.FromArray(source, i), mesh.getWorldMatrix()));
      for (let i=0; i<indices.length; i+=3) {
        const triangle = Array.from(indices.slice(i,i+3),index => vertices[index]), crossings = [];
        for (let edge=0;edge<3;edge++) {
          const a=triangle[edge], b=triangle[(edge+1)%3];
          if ((a.y-1.3)*(b.y-1.3)<0) crossings.push(a.x+(b.x-a.x)*(1.3-a.y)/(b.y-a.y));
        }
        if(crossings.length)spans.push([Math.min(...crossings),Math.max(...crossings)]);
      }
    }
    const merged=[];
    for(const [min,max] of spans.sort((a,b)=>a[0]-b[0])) {
      const last=merged.at(-1);
      if(last && min<=last[1]+.001)last[1]=Math.max(last[1],max);else merged.push([min,max]);
    }
    assert.equal(merged.length,2,'Two masonry jambs, no stone across the passage');
    const opening=merged[1][0]-merged[0][1];
    assert.ok(opening>3.35&&opening<3.45,`actual opening ${opening}`);
    const world=new CollisionWorld();registerFortPartCollider(world,'wall_thin_gate_01',0,0,gate.size,0,0,5.6);
    assert.equal(world.isBlocked({x:0,z:0},.46),false);
    assert.equal(world.isBlocked({x:2.3,z:0},.46),true);
    gate.root.rotation.y=Math.PI/2;gate.root.position.set(-7,0,-22.2);
    gate.root.computeWorldMatrix(true);gate.meshes.forEach(m=>m.computeWorldMatrix(true));
    const turned=gate.root.getHierarchyBoundingVectors(true);
    assert.ok(Math.abs((turned.min.x+turned.max.x)/2+7)<.001);
    assert.ok(Math.abs((turned.min.z+turned.max.z)/2+22.2)<.001);
    gate.root.dispose(false,false);container.dispose();
  } finally {scene.dispose();engine.dispose();}
});

test('Greenfall has continuous perimeter walls and a direct unobstructed gate approach', () => {
  const world = new CollisionWorld();
  for (const p of greenfallFortLayout(-7,-5)) registerFortPartCollider(world,p.part,p.x,p.z,{x:p.width,z:p.depth},p.rotation,0,p.height);
  assert.equal(pathSegmentIsClear(world,{x:-7,z:-29},{x:-7,z:-15},.46),true);
  for(let z=-22.2;z<=5.5;z+=.2)for(const x of [-22.8,8.8])assert.equal(world.isBlocked({x,z},.1),true,`side seam ${x}/${z}`);
  for(let x=-22.8;x<=8.8;x+=.2)assert.equal(world.isBlocked({x,z:5.5},.1),true,`rear seam ${x}`);
  for(let x=-22.8;x<=8.8;x+=.2)if(Math.abs(x+7)>1.7)assert.equal(world.isBlocked({x,z:-22.2},.1),true,`front seam ${x}`);
  assert.equal(world.isBlocked({x:-7,z:-20},.42),false,'guide keeps his existing free interaction position');
});

test('building and smithy roofs cover all four supporting corners with pitched geometry', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    for(const [width,depth,rise] of [[7.3,5.6,1.55],[6.2,4.6,.8]]) {
      const roof=createGabledRoof(scene,'roof',width,depth,rise);
      const bounds=roof.getBoundingInfo().boundingBox;
      assert.equal(bounds.maximum.x-bounds.minimum.x,width);
      assert.ok(Math.abs(bounds.maximum.z-bounds.minimum.z-depth)<.00001);
      assert.ok(Math.abs(bounds.maximum.y-rise)<.00001);
      const normals=roof.getVerticesData(VertexBuffer.NormalKind);
      assert.ok(normals.slice(1,24).some((v,i)=>i%3===0&&v>0),'slopes face sky');
      roof.dispose();
    }
  } finally {scene.dispose();engine.dispose();}
});
