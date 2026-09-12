import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {MONSTERS} from '../src/data/game-data.ts';

function impact(id,release=true){
 const events=[],p={id:'hero',generation:7,hp:1000,stats:{def:10,evasion:0},buffs:{guard:0}};
 const context={safe:()=>false,state:{time:100},books:{attacked(){}},random:()=>1,event:(kind,actor,target,details)=>events.push({kind,actor,target,...details})};
 const monster={uid:'monster:'+id,id,phase:1};
 WorldSimulation.prototype.monsterHit.call(context,monster,p,1,release?undefined:{type:'physical',release:false});
 return {events,p};
}
for(const [id,effect] of Object.entries({fire_golem:'fire',ice_golem:'ice',rift_boss:'fire',cave_boss:'fire'}))test(id+' ordinary contact has elemental visual with unchanged instant damage',()=>{
 const {events,p}=impact(id),release=events.find(e=>e.kind==='release'),hit=events.find(e=>e.kind==='hit');
 assert.equal(release.effect,effect);assert.equal(release.durationMs,0);assert.equal(release.generation,7);
 assert.equal(hit.amount,Math.round(MONSTERS[id].atk-2));assert.equal(1000-p.hp,hit.amount);assert.equal(events.filter(e=>e.kind==='release').length,1);
});
test('ordinary non-golem keeps its existing slash',()=>assert.equal(impact('wolf').events.find(e=>e.kind==='release').effect,'slash'));
test('counter contact does not add an ordinary release to its existing aimed-line',()=>assert.equal(impact('fire_golem',false).events.some(e=>e.kind==='release'),false));
