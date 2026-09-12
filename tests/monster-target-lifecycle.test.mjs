import test from 'node:test';
import assert from 'node:assert/strict';
import {makeP2Simulation} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';

function fixture(){
 const sim=makeP2Simulation(),p=sim.createCharacter('Target lifetime','ranger');
 const m=sim.state.monsters.find(m=>m.id==='fire_golem');
 sim.relocate(p,{x:m.home.x+11,z:m.home.z,spaceId:m.spaceId});sim.heartbeat(p.id);
 sim.provoke(m,p);return {sim,p,m};
}

test('same-space teleport releases stale provocation before cross-map LOS or navigation',()=>{
 const {sim,p,m}=fixture(),hp=m.hp;
 sim.relocate(p,{x:-560.461,z:444.944,spaceId:'surface'});
 const rays=[],paths=[];sim.lineOfSight=(a,b)=>{rays.push([a,b]);return true;};
 sim.walk=(actor,goal)=>paths.push({actor:actor.uid,goal});
 sim.monsterTick(m,1/60);
 assert.equal(m.targetId,null);assert.equal(m.provokedBy,undefined);
 assert.equal(rays.some(([a,b])=>a===m&&b===p),false);
 assert.equal(paths.some(row=>row.goal===p),false);
 assert.equal(m.hp,hp);assert.equal(p.kills,0);
});

test('a displaced former pursuer follows its normal home return after teleport',()=>{
 const {sim,p,m}=fixture();m.x=m.home.x+3;m.hp-=7;
 sim.relocate(p,{x:-560.461,z:444.944,spaceId:'surface'});
 const paths=[];sim.walk=(actor,goal)=>paths.push({actor:actor.uid,goal});
 sim.monsterTick(m,1/60);
 assert.equal(sim.brains.get(m.uid).state,'leash');assert.equal(m.targetId,null);
 assert.equal(paths.length,1);assert.deepEqual(paths[0].goal,m.home);
 // Existing golem reset on entering return is retained, rather than a new heal policy.
 assert.equal(m.hp,650);
});

test('provoked targets retain the complete reachable leash plus counter range boundary',()=>{
 for(const delta of [0,.001]){
  const {sim,p,m}=fixture(),slot=sim.finalWorld.slotById.get(m.uid);
  const reach=slot.leashRadius+Math.max(sim.monsterRange(m),sim.rangedResponse(m).range);
  Object.assign(p,{x:m.home.x+reach+delta,z:m.home.z});
  sim.lineOfSight=()=>true;sim.walk=()=>{};sim.monsterTick(m,1/60);
  assert.equal(m.targetId,delta===0?p.id:null);
 }
});

test('restored stale target records cannot regain a cross-map route with a fresh brain',()=>{
 const {sim,p,m}=fixture();sim.brains.delete(m.uid);
 Object.assign(p,{x:-560.461,z:444.944});
 let walkedToHero=false;sim.walk=(_m,goal)=>{walkedToHero ||= goal===p;};
 sim.monsterTick(m,1/60);
 assert.equal(walkedToHero,false);assert.equal(m.targetId,null);assert.equal(m.provokedBy,undefined);
});

test('changing space cancels a provoked target without a path into the other map',()=>{
 const {sim,p,m}=fixture();m.x=m.home.x+3;
 Object.assign(p,{x:m.x,z:m.z,spaceId:'great_cave'});
 let chased=false;sim.walk=(_m,goal)=>{chased ||= goal===p;};
 sim.monsterTick(m,1/60);
 assert.equal(chased,false);assert.equal(m.targetId,null);assert.equal(m.provokedBy,undefined);
 assert.equal(sim.brains.get(m.uid).state,'leash');
});
