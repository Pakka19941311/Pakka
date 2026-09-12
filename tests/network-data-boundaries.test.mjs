import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SERVICES} from '../src/world/territory.ts';

function fixture(){
 let serial=0;const store={load:()=>null,save:()=>{},receipt:()=>null,commit:()=>{}};
 const sim=new WorldSimulation({store,collision:new CollisionWorld(),now:1000,identifier:()=>`boundary-${++serial}`});
 const p=sim.createCharacter('Boundary QA','knight');Object.assign(p,SERVICES['npc:teleport']);sim.heartbeat(p.id);return {sim,p};
}
test('teleport destination rejects inherited object properties without changing money or position',()=>{
 for(const destination of ['__proto__','constructor','toString','hasOwnProperty']){
  const {sim,p}=fixture(),before=structuredClone(p);
  const receipt=sim.command(p.id,'teleport-boundary-001',{type:'teleport',destination});
  assert.equal(receipt.ok,false,destination);assert.equal(receipt.reason,'teleport-unavailable');
  assert.deepEqual(sim.state.characters[p.id],before);
 }
});
test('class id is a string catalogue key, not a coercible array or object',()=>{
 const {sim}=fixture(),before=Object.keys(sim.state.characters);
 for(const classId of [['knight'],['mage'],{},null,7])assert.throws(()=>sim.createCharacter('Invalid',classId),/invalid-character/);
 assert.deepEqual(Object.keys(sim.state.characters),before);
});
