import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { TerrainSurface } from '../src/world/terrain-surface.ts';
import { createLayoutRandom } from '../src/world/layout-random.ts';
import { registerCastleCollider } from '../src/world/castle-collision.ts';
import { worldTopology,restoreWorldTopology } from '../src/world/world-topology.ts';

test('the serialized server map preserves a real castle opening, overhead obstruction and raised support',()=>{
  const castle=JSON.parse(readFileSync('public/assets/world/castle_pack/prepared-castle.json'));
  const profile=castle.modules.find(m=>m.name==='castle_arch').collision_profile;
  const collision=new CollisionWorld(),terrain=new TerrainSurface();
  registerCastleCollider(collision,'castle_arch',-7,-23,{x:7.2,y:5.6,z:1.3},0,0,profile);
  terrain.addPlatform(-17.2,-11.2,5.8,4.4,.16);
  const restored=restoreWorldTopology(JSON.parse(JSON.stringify(worldTopology(collision,terrain))));
  for(const c of [collision,restored.collision]){
    assert.equal(c.isBlocked({x:-7,z:-23},.46),false);
    assert.equal(c.isBlocked({x:-10.2,z:-23},.46),true);
    assert.equal(c.hasLineOfSight({x:-7,y:1.2,z:-26},{x:-7,y:1.2,z:-20}),true);
    assert.equal(c.hasLineOfSight({x:-7,y:4,z:-26},{x:-7,y:4,z:-20}),false);
  }
  assert.equal(restored.terrain.supportAt(-17.2,-11.2),terrain.supportAt(-17.2,-11.2));
  assert.deepEqual(worldTopology(restored.collision,restored.terrain),worldTopology(collision,terrain));
});

test('invalid map dimensions and mismatched terrain versions never create partial server maps',()=>{
  const collision=new CollisionWorld();collision.addBox(0,0,1,1,0,0,5);
  const valid=worldTopology(collision,new TerrainSurface());
  for(const mutate of [m=>m.terrainVersion++,m=>m.colliders[0].halfX=Infinity,m=>m.colliders[0].top=-1,
    m=>m.colliders[0].blocksMovement='false',m=>m.colliders=[],m=>m.platforms=[{x:0,z:0,y:2,width:-1,depth:2,rotation:0}]]){
    const invalid=structuredClone(valid);mutate(invalid);assert.throws(()=>restoreWorldTopology(invalid),/invalid-world-topology/);
  }
});

test('decoration choices cannot be changed by gameplay randomness in another client',()=>{
  const first=createLayoutRandom(),second=createLayoutRandom();
  for(let i=0;i<40;i++){
    const expected=first(-150,150);for(let n=0;n<i;n++)Math.random();
    assert.equal(second(-150,150),expected);
  }
});
