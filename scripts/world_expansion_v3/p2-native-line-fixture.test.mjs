import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeLineFixture} from './p2-native-line-fixture.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
import {makeP2Simulation,stepP2} from './p2-combat-smoke.mjs';

for(const [stage,dodge] of [['p2-line-fire',false],['p2-line-ice-dodge',true]]){
 test(stage+' uses untouched live monster and legal input path',()=>{
  const geography=new FinalWorld(undefined,true,{populationMode:'starter-v3'}),sim=makeP2Simulation({geography});
  const p=sim.createCharacter('Native line fixture','knight'),monsters=JSON.stringify(sim.state.monsters),clock=sim.state.time;
  p.inventory.push({...sim.item('potion'),uid:'fixture-existing-sparse-500'});
  const inventory=JSON.stringify(p.inventory);
  const f=prepareNativeLineFixture(sim,geography,p,stage),m=sim.state.monsters.find(m=>m.uid===f.targetUid);
  assert.equal(JSON.stringify(sim.state.monsters),monsters);assert.equal(sim.state.time,clock);
  assert.equal(JSON.stringify(p.inventory),inventory);assert.equal(f.populationBefore,f.populationAfter);
  assert.equal(p.classId,'ranger');assert.equal(p.level,15);assert.ok(m.hp>600);
  p.hp-=7;const damaged=p.hp;
  assert.deepEqual(prepareNativeLineFixture(sim,geography,p,stage),f);assert.equal(p.hp,damaged,'repeat fixture cannot heal');
  sim.heartbeat(p.id);sim.input(p.id,1,{type:'destination',x:f.engagePoint.x,z:f.engagePoint.z});
  for(let t=0;t<6000&&Math.hypot(p.x-f.engagePoint.x,p.z-f.engagePoint.z)>.3&&!sim.state.pending.some(a=>a.actor===m.uid&&a.counter);t+=50)stepP2(sim,50);
  sim.input(p.id,2,{type:'attack',entityId:m.uid,skill:null,mode:'single'});
  let a;for(let t=0;t<12000;t+=50){a=sim.state.pending.find(a=>a.actor===m.uid&&a.counter);if(a)break;stepP2(sim,50);}
  assert.ok(a,'single legal attack provokes real counter');
  const line=sim.snapshot(p.id).groundEffects.find(e=>e.kind==='line'&&e.owner===m.uid);
  assert.equal(line.halfWidth,.9);assert.equal(line.effect,dodge?'ice':'fire');
  const hp=p.hp,endpoint=structuredClone(a.counter.endPoint);
  sim.input(p.id,3,dodge?{type:'destination',x:f.sidestep.x,z:f.sidestep.z}:{type:'cancel'});
  stepP2(sim,a.hitAt-sim.state.time+100);
  assert.deepEqual(a.counter.endPoint,endpoint);
  const releases=sim.events.filter(e=>e.kind==='release'&&e.actor===m.uid&&e.attackKind==='aimed-line');
  const hits=sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id);
  assert.equal(releases.length,1);assert.equal(hits.length,dodge?0:1);
  if(dodge){assert.equal(p.hp,hp);assert.ok(Math.hypot(p.x-f.standing.x,p.z-f.standing.z)>2);}
  else assert.ok(p.hp<hp);
 });
}
