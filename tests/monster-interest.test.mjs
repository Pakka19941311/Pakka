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

test('bounded interiors include distant residents but never cross space boundaries',()=>{
 for(const spaceId of ['mine','great_cave']) {
  const hero={id:'h',x:0,z:0,spaceId,target:'m'};
  assert.equal(monsterInInterest({uid:'m',x:300,z:0,spaceId},hero),true);
  assert.equal(monsterInInterest({uid:'m',x:0,z:0,spaceId:'surface',targetId:'h'},hero),false);
 }
});

test('cave entrance and reentry retain the one boss, corpse and respawn state',()=>{
 const sim=makeP2Simulation(),p=sim.createCharacter('Cave interest','knight');
 Object.assign(p,{spaceId:'great_cave',x:0,z:-6});
 const boss=sim.state.monsters.find(m=>m.uid==='wf:great_cave:cave_boss:000');
 assert.ok(boss);
 assert.ok(Math.hypot(boss.x-p.x,boss.z-p.z)>100);
 const expected=sim.state.monsters.filter(m=>m.spaceId==='great_cave');
 assert.equal(expected.length,111);
 assert.equal(sim.snapshot(p.id).monsters.length,111);
 Object.assign(boss,{alive:false,hp:0,respawnAt:sim.state.time+60000});
 const before=JSON.stringify(sim.state.monsters),time=sim.state.time;
 p.spaceId='surface';
 assert.equal(sim.snapshot(p.id).monsters.some(m=>m.uid===boss.uid),false);
 p.spaceId='great_cave';
 const returned=sim.snapshot(p.id).monsters.filter(m=>m.uid===boss.uid);
 assert.equal(returned.length,1);
 assert.equal(returned[0].alive,false);
 assert.equal(JSON.stringify(sim.state.monsters),before);
 assert.equal(sim.state.time,time);
 assert.equal(sim.snapshot(p.id).populationCapacity,1151);
});
