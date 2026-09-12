import test from 'node:test';
import assert from 'node:assert/strict';
import {actorGeometryV3,bodyContactReach} from '../src/data/actor-geometry-v3.ts';
import {makeP2Simulation,stepP2} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {prepareRangedControl} from '../scripts/world_expansion_v3/ranged-response-control.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('measured bodies are opt-in and canonical aliases do not activate later cohorts',()=>{
 for(const [id,radius] of [['fire_golem',1.5],['ice_golem',1.3],['rift_boss',2.4],['cave_boss',2.4]]){
  assert.equal(actorGeometryV3({id},'starter-v3').bodyRadius,radius);
  assert.equal(actorGeometryV3({id},'legacy'),null);
  assert.equal(actorGeometryV3({id,canonicalMobId:'MOB-39'},'starter-v3'),null);
 }
 assert.equal(actorGeometryV3({id:'v3_armored_beetle',canonicalMobId:'MOB-05'},'starter-v3').bodyRadius,1);
 assert.equal(bodyContactReach(2.6,.46,2.4),3.21);
 assert.equal(bodyContactReach(13,.46,2.4),13);
});

test('all 1151 slots retain their homes with clear enlarged torso footprints',()=>{
 const sim=makeP2Simulation();assert.equal(sim.state.monsters.length,1151);let measured=0;
 for(const m of sim.state.monsters){const g=actorGeometryV3(m,'starter-v3');if(!g)continue;measured++;
  const slot=sim.finalWorld.slotById.get(m.uid);
  assert.equal(sim.bodyRadius(m),g.bodyRadius);assert.equal(sim.monsterRadius(m),g.bodyRadius);
  assert.equal(sim.finalWorld.space(m).collision.isBlocked(m,g.bodyRadius),false,m.uid);
  assert.equal(gap(m.home,slot),0,m.uid+' unexpected home movement');
  assert.ok(sim.monsterMeleeRange(m)>=g.bodyRadius+.46+.35-.00001);
 }
 assert.equal(measured,166);
});

test('knight approaches and hits the enlarged rift outside its body with the advertised selected range',()=>{
 const f=prepareRangedControl({speciesId:'rift_boss',classId:'knight',level:40}),{sim,p,m}=f;
 f.startAggression();assert.equal(sim.snapshot(p.id).character.attackRange,3.21);
 let hit,minGap=Infinity;
 for(let i=0;i<180&&!p.dead;i++){
  f.advance(50);minGap=Math.min(minGap,gap(p,m));
  hit=sim.events.find(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid);if(hit)break;
 }
 assert.ok(hit,'ordinary real approach/release must connect');
 assert.ok(minGap>=2.4+.46-.002,'hero never enters solid torso');
 assert.ok(gap(p,m)<=3.46);
 assert.equal(sim.monsterRange(m),3.21);
 const row=sim.snapshot(p.id).monsters.find(x=>x.uid===m.uid);assert.equal(row.visualHeight,10.2);assert.equal(row.impactHeight,6.42);assert.equal(row.geometryVersion,'production-torso-20260912-v1');
});

test('ranger keeps 13m and actual released projectile hits the measured torso',()=>{
 const f=prepareRangedControl(),{sim,p,m}=f;f.startAggression();assert.equal(sim.snapshot(p.id).character.attackRange,13);
 f.advance(1000);const release=sim.events.find(e=>e.kind==='release'&&e.actor===p.id);
 assert.ok(release);assert.ok(Math.abs(release.destination.y-sim.finalWorld.space(m).terrain.supportAt(release.destination.x,release.destination.z)-3.84)<1e-8);
 assert.ok(sim.events.some(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid));
 const counter=sim.state.pending.find(a=>a.counter);
 if(counter)assert.ok(Math.abs(counter.counter.origin.y-sim.finalWorld.space(m).terrain.supportAt(counter.counter.origin.x,counter.counter.origin.z)-4.9)<1e-8);
});

test('restart retains wounds, four boss identities and dead boss deadlines after geometry refresh',()=>{
 const sim=makeP2Simulation();const bosses=sim.state.monsters.filter(m=>sim.finalWorld.slotById.get(m.uid)?.boss);
 assert.equal(bosses.length,4);const cave=bosses.find(m=>m.id==='cave_boss');
 cave.alive=false;cave.hp=0;cave.respawnAt=sim.state.time+25000;cave.deathAt=sim.state.time;cave.generation=3;
 const fire=sim.state.monsters.find(m=>m.id==='fire_golem');fire.hp-=7;
 const before=structuredClone(bosses);sim.checkpoint();const reloaded=makeP2Simulation({geography:sim.finalWorld,store:sim.store,now:sim.state.time});
 assert.equal(reloaded.state.monsters.find(m=>m.uid===fire.uid).hp,fire.hp);
 for(const old of before){const m=reloaded.state.monsters.find(m=>m.uid===old.uid);for(const key of ['hp','alive','respawnAt','generation','deathAt'])assert.equal(m[key],old[key]);}
 assert.equal(reloaded.state.monsters.length,1151);
 const legacy=makeP2Simulation({geography:new FinalWorld()});
 assert.equal(legacy.bodyRadius(legacy.state.monsters.find(m=>m.id==='rift_boss')),1.65);
});
