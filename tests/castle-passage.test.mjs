import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { registerCastleCollider } from '../src/world/castle-collision.ts';
import { greenfallFortLayout } from '../src/world/greenfall-layout.ts';
import { findNavigationPath } from '../src/world/navigation.ts';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/world/castle_pack/prepared-castle.json',import.meta.url),'utf8'));
const profile=manifest.modules.find(m=>m.name==='castle_arch').collision_profile;
const roles={wall_thin_gate_01:'castle_arch',wall_thin_straight_01:'castle_wall',tower_round:'castle_tower'};

test('new castle keeps the actual Greenfall gate route open and its walls solid',()=>{
  const world=new CollisionWorld();
  for(const p of greenfallFortLayout(-7,-5))registerCastleCollider(world,roles[p.part],p.x,p.z,
    {x:p.width,y:p.height,z:p.depth},p.rotation,0,profile);
  const from={x:-7,z:-29},to={x:-7,z:-15};
  const path=findNavigationPath(world,from,to,{actorRadius:.46,cellSize:.85});
  assert.equal(path.length,1,'click-to-move can take the straight street through the gate');
  const moved=world.resolve(from,{x:0,z:14},.46);
  assert.equal(moved.blocked,false);assert.ok(Math.abs(moved.z-to.z)<1e-6);
  assert.equal(world.isBlocked({x:-7+2.4,z:-22.2},.46),true,'stone gate pier is solid');
  assert.equal(world.isBlocked({x:-7+15.8,z:-10},.46),true,'side wall is solid');
  assert.equal(world.hasLineOfSight({x:-7,y:1.8,z:-25},{x:-7,y:1.8,z:-19}),true,'view through the opening remains clear');
  assert.equal(world.hasLineOfSight({x:-7,y:3.6,z:-25},{x:-7,y:3.6,z:-19}),false,'stone arch blocks elevated attacks');
  assert.ok(world.cameraDistance({x:-7,y:1.6,z:-20},{x:-7,y:5,z:-25})<Math.hypot(3.4,5),'camera cannot pass through the arch');
});

test('overhead geometry does not eject a walking actor or obstruct a rotated passage',()=>{
  const world=new CollisionWorld();
  registerCastleCollider(world,'castle_arch',4,8,{x:7.2,y:5.6,z:1.75},Math.PI/2,2,profile);
  const moved=world.resolve({x:4,z:8},{x:4,z:0},.46);
  assert.equal(moved.blocked,false);assert.ok(Math.abs(moved.x-8)<1e-6);
  assert.equal(world.hasLineOfSight({x:1,y:3.8,z:8},{x:7,y:3.8,z:8}),true);
  assert.equal(world.hasLineOfSight({x:1,y:5.6,z:8},{x:7,y:5.6,z:8}),false);
});
