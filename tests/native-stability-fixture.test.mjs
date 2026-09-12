import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeP2Simulation} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {prepareNativeStabilityFixture} from '../scripts/world_expansion_v3/native-stability-fixture.mjs';

test('stability approach fixtures preserve actual population, clock and resources',()=>{
 const world=makeP2Simulation(),hero=world.createCharacter('Synthetic stability','knight');
 const geography=world.finalWorld;
 const hash=()=>createHash('sha256').update(JSON.stringify(world.state.monsters)).digest('hex');
 const before={hash:hash(),time:world.state.time,hp:hero.hp,gold:hero.gold,inventory:JSON.stringify(hero.inventory)};
 for(const [index,kind] of ['teleporter','portal-mine','portal-great_cave'].entries()){
  const f=prepareNativeStabilityFixture(world,geography,hero,`stability:${kind}:${index}`);
  assert.equal(hash(),before.hash);assert.equal(world.state.time,before.time);
  assert.equal(hero.hp,before.hp);assert.equal(hero.gold,before.gold);assert.equal(JSON.stringify(hero.inventory),before.inventory);
  assert.ok(!geography.spaces.surface.collision.isBlocked(hero,.46));
  assert.equal(f.population,1151);
  if(kind==='teleporter')assert.ok(world.nearService(hero,'teleport'));
  else{
   const id=kind.slice(7),d=geography.spaces[id].definition;
   assert.ok(Math.hypot(hero.x-d.surface_portal[0],hero.z+d.surface_portal[2])<=3.2);
   assert.deepEqual(f.exit,{x:d.entry[0],z:-d.entry[2]});
  }
 }
 assert.throws(()=>prepareNativeStabilityFixture(world,geography,hero,'stability:kill-boss:1'));
});
