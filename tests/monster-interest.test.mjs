import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterInInterest} from '../src/network/monster-interest.ts';
import {makeP2Simulation} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';

test('visible range plus preload margin and combat references survive interest filtering',()=>{
 const hero={id:'h',x:0,z:0,target:null};
 for(const distance of [0,84.99,85,99.99])assert.equal(monsterInInterest({uid:'m',x:distance,z:0},hero),true);
 assert.equal(monsterInInterest({uid:'m',x:101,z:0},hero),false);
 assert.equal(monsterInInterest({uid:'m',x:200,z:0},{...hero,target:'m'}),true);
 assert.equal(monsterInInterest({uid:'m',x:200,z:0,targetId:'h'},hero),true);
});

test('snapshot interest leaves persistent population, timer and reward state intact',()=>{
 const sim=makeP2Simulation(),p=sim.createCharacter('Interest test','knight');
 const state=JSON.stringify(sim.state.monsters),time=sim.state.time;
 const a=sim.snapshot(p.id);
 assert.equal(JSON.stringify(sim.state.monsters),state);
 assert.equal(sim.state.time,time);
 assert.equal(a.populationCapacity,1151);
 assert.ok(a.monsters.length<sim.state.monsters.length);
 const visible=sim.state.monsters.filter(m=>m.spaceId===p.spaceId&&Math.hypot(m.x-p.x,m.z-p.z)<85);
 for(const m of visible)assert.ok(a.monsters.some(n=>n.uid===m.uid));
});
