import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SERVICES} from '../src/world/territory.ts';
import {P2MemoryStore} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';

function fixture(){let serial=0;const sim=new WorldSimulation({store:new P2MemoryStore(),collision:new CollisionWorld(),now:1000,identifier:()=>`boundary-${++serial}`,random:()=>.5});
 const p=sim.createCharacter('Boundary','knight');Object.assign(p,SERVICES['npc:shop'],{gold:10000});return {sim,p};}
test('coercible array item IDs cannot enter inventory through a shop purchase',()=>{
 const {sim,p}=fixture(),before=structuredClone(p);
 const result=sim.command(p.id,'bad-array-purchase',{type:'buy',itemId:['potion']});
 assert.equal(result.ok,false);assert.deepEqual(sim.state.characters[p.id].inventory,before.inventory);assert.equal(sim.state.characters[p.id].gold,before.gold);
});
test('ordinary string consumable purchase retains its price, stack and receipt deduplication',()=>{
 const {sim,p}=fixture(),before=p.inventory.find(i=>i.id==='potion')?.count??0;
 const first=sim.command(p.id,'valid-purchase-id',{type:'buy',itemId:'potion'}),again=sim.command(p.id,'valid-purchase-id',{type:'buy',itemId:'potion'});
 assert.equal(first.ok,true);assert.deepEqual(again,first);assert.equal(p.gold,9945);assert.equal(p.inventory.find(i=>i.id==='potion').count,before+1);
 assert.ok(p.inventory.every(i=>typeof i.id==='string'));
});
test('the common item factory rejects invalid counts without consuming an identity',()=>{
 const {sim}=fixture();let serial=0;sim.identifier=()=>`factory-${++serial}`;
 for(const count of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1'])assert.throws(()=>sim.item('potion',count),/invalid-item-count/);
 assert.equal(serial,0);assert.equal(sim.item('potion',2).count,2);assert.equal(serial,1);
});
