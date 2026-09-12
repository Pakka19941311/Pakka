import test from 'node:test';
import assert from 'node:assert/strict';
import {repairLegacyFinalPopulation,obsoleteFinalPopulation} from '../src/world/legacy-final-population-repair.ts';
import {SPAWN_REGIONS} from '../src/world/spawn-regions.ts';
import {makeP2Simulation,P2MemoryStore} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';

const geography=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
function mixed(){
 const sim=makeP2Simulation({geography});
 const p=sim.createCharacter('Migration fixture','knight');p.gold=12345;
 const old=SPAWN_REGIONS.flatMap(r=>Array.from({length:r.population},(_,i)=>{
  const m=structuredClone(sim.state.monsters.find(m=>m.id===r.monsterId));
  return {...m,uid:`${r.id}:${i}`,regionId:r.id,home:{...r.center},...r.center,spaceId:undefined};
 }));
 sim.state.monsters.push(...old);sim.checkpoint();
 return {sim,old,p,store:sim.store};
}

test('mixed saved world archives only obsolete slots, keeps four boss lifecycles and is idempotent',()=>{
 const {sim,old,p,store}=mixed();
 const bosses=sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss);
 bosses[0].alive=false;bosses[0].hp=0;bosses[0].deathAt=sim.state.time;bosses[0].respawnAt=sim.state.time+900000;bosses[0].generation=4;
 bosses[1].hp-=9;sim.checkpoint();
 const expectedBosses=structuredClone(bosses),expectedOld=structuredClone(old);
 const recovered=makeP2Simulation({geography,store,now:sim.state.time});
 assert.equal(recovered.state.monsters.length,1151);assert.equal(new Set(recovered.state.monsters.map(m=>m.uid)).size,1151);
 assert.deepEqual(recovered.state.legacyFinalPopulationRepairs[0].archived.map(x=>x.monster),expectedOld);
 for(const before of expectedBosses){const after=recovered.state.monsters.find(m=>m.uid===before.uid);
  for(const key of ['hp','alive','deathAt','respawnAt','generation','phase','owner'])assert.equal(after[key],before[key],before.uid+':'+key);}
 assert.equal(recovered.state.characters[p.id].gold,12345);assert.equal(recovered.events.filter(e=>['death','loot','experience'].includes(e.kind)).length,0);
 const before=structuredClone(recovered.state.legacyFinalPopulationRepairs);
 const again=makeP2Simulation({geography,store,now:recovered.state.time});
 assert.equal(again.state.monsters.length,1151);assert.deepEqual(again.state.legacyFinalPopulationRepairs,before);
});

test('unknown, wrong-species, canonical, night and independently owned temporary records are not retired',()=>{
 const sim=makeP2Simulation({geography}),boss=sim.state.monsters.find(m=>m.id==='rift_boss');
 const rows=[{...boss,uid:'custom:rift'},{...boss,uid:'rift-warden-arena:0',id:'wolf'},
  {...boss,uid:'rift-warden-arena:0',canonicalMobId:'MOB-99'},
  {...boss,uid:'rift-warden-arena:0',nightIndex:1},{...boss,uid:'rift-warden-arena:0',temporaryOwner:'player:1'}];
 for(const row of rows){assert.equal(obsoleteFinalPopulation([row],geography.slots).length,0);
  assert.deepEqual(repairLegacyFinalPopulation([row],geography.slots).monsters,[row]);}
});

test('missing authoritative boss fails before saving instead of silently spawning a fresh boss',()=>{
 const {sim,store}=mixed();sim.state.monsters=sim.state.monsters.filter(m=>m.uid!=='wf:volcano:rift_boss:000');sim.checkpoint();
 const before=structuredClone(store.saved);
 assert.throws(()=>makeP2Simulation({geography,store,now:sim.state.time}),/legacy-population-boss-counterpart-missing/);
 assert.deepEqual(store.saved,before);
});

test('retired attacks and owned children cannot damage a hero after recovery',()=>{
 const {sim,store,p}=mixed(),uid='rift-warden-arena:0';
 const child={...structuredClone(sim.state.monsters.find(m=>m.uid===uid)),uid:'old-boss-child',temporaryOwner:uid};
 sim.state.monsters.push(child);
 sim.state.pending.push({actor:uid,target:p.id,owner:uid,hitAt:sim.state.time+1,monster:true,skill:null,generation:p.generation});
 sim.state.projectiles.push({actor:child.uid,target:p.id,generation:p.generation,actorGeneration:1,endsAt:sim.state.time+1});
 sim.checkpoint();const fixed=makeP2Simulation({geography,store,now:sim.state.time});
 assert.equal(fixed.state.monsters.some(m=>m.uid===child.uid),false);assert.equal(fixed.state.pending.length,0);assert.equal(fixed.state.projectiles.length,0);
 assert.ok(fixed.state.legacyFinalPopulationRepairs[0].archived.some(x=>x.monster.uid===child.uid));
});

test('a final-world save cannot be reopened in the obsolete small-map runtime',()=>{
 const sim=makeP2Simulation({geography}),store=new P2MemoryStore();store.saved=structuredClone(sim.state);
 const before=structuredClone(store.saved);
 assert.throws(()=>new WorldSimulation({store,collision:new CollisionWorld(),now:sim.state.time,identifier:()=>''}),/saved-final-world-requires-final-runtime/);
 assert.deepEqual(store.saved,before);
});

test('blocked authoritative geometry still aborts; the collision guard is not bypassed',()=>{
 const sim=makeP2Simulation({geography}),m=sim.state.monsters.find(m=>m.id==='rift_boss');
 m.home={x:5000,z:5000,spaceId:'surface'};sim.checkpoint();
 assert.throws(()=>makeP2Simulation({geography,store:sim.store,now:sim.state.time}),/actor-geometry-home-blocked:wf:volcano:rift_boss:000/);
});
