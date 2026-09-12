import test from 'node:test';
import assert from 'node:assert/strict';
import {makeP2Geography,makeP2Simulation} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
const geography=makeP2Geography();
function fixture(distance){
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Target boundary','ranger'),m=sim.state.monsters.find(m=>m.id==='fire_golem');
 Object.assign(m,{x:500,z:500});Object.assign(p,{x:500-distance,z:500,spaceId:'surface'});sim.heartbeat(p.id);
 // Policy boundary fixture: geometry has its own differential and route tests.
 sim.lineOfSight=()=>true;
 return {sim,p,m,input:()=>sim.input(p.id,1,{type:'attack',entityId:m.uid,skill:null,mode:'single'})};
}
test('new target acquisition keeps the existing 100m interest boundary inclusive',()=>{
 for(const distance of [13,99.999,100]){const {p,m,input}=fixture(distance);input();assert.equal(p.target,m.uid);assert.equal(p.singleAttack,true);}
});
test('a forged remote target cannot create a hero path or replace selection',()=>{
 for(const distance of [100.001,1100]){
  const {sim,p,input}=fixture(distance),before={target:p.target,destination:p.destination,x:p.x,z:p.z};
  assert.throws(input,/target-out-of-interest/);
  assert.deepEqual({target:p.target,destination:p.destination,x:p.x,z:p.z},before);assert.equal(sim.paths.has(p.id),false);
 }
});
test('ongoing selected combat retains its prior lifecycle and other-space IDs stay rejected',()=>{
 const existing=fixture(101);existing.p.target=existing.m.uid;existing.input();assert.equal(existing.p.target,existing.m.uid);
 const elsewhere=fixture(5);elsewhere.m.spaceId='great_cave';assert.throws(elsewhere.input,/missing-target/);assert.equal(elsewhere.p.target,null);
});
test('nearby new targets still require the existing line of sight',()=>{
 const f=fixture(13);f.sim.lineOfSight=()=>false;assert.throws(f.input,/target-occluded/);assert.equal(f.p.target,null);
});
