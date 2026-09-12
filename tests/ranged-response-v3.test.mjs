import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MONSTERS} from '../src/data/game-data.ts';
import {rangedResponseV3,RANGED_RESPONSE_V3} from '../src/data/ranged-response-v3.ts';
import {resolveHeroDamageV3} from '../src/core/encounter-combat-v3.ts';
import {prepareRangedControl} from '../scripts/world_expansion_v3/ranged-response-control.mjs';
import {makeP2Simulation} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const definitionsBefore=JSON.stringify(MONSTERS);

test('candidate registry adds only selected actions, with exact timings and no stats/loot/levels',()=>{
 for(const id of ['fire_golem','ice_golem','rift_boss']){
  const r=rangedResponseV3(id);assert.equal(r.range,16);assert.equal(r.cooldown,7);assert.equal(r.windup,1.2);assert.equal(r.recovery,1.6);assert.equal(r.halfWidth,.9);assert.equal(r.multiplier,1.2);assert.equal(r.type,'magic');
  for(const forbidden of ['hp','atk','def','mdef','xp','gold','drops','level'])assert.equal(forbidden in r,false);
 }
 assert.equal(rangedResponseV3('cave_boss'),null);assert.equal(rangedResponseV3('wolf'),null);assert.equal(rangedResponseV3('fire_golem','MOB-39'),null);
 assert.equal(RANGED_RESPONSE_V3.populationMode,'starter-v3');
});
for(const speciesId of ['fire_golem','ice_golem','rift_boss'])test(speciesId+' stationary target receives one typed hit after the advertised windup',()=>{
 const f=prepareRangedControl({speciesId,classId:speciesId==='rift_boss'?'necro':'ranger',level:speciesId==='rift_boss'?40:15,bookId:speciesId==='rift_boss'?'book_necro_40':undefined}),{sim,p,m}=f;
 assert.equal(m.hp,MONSTERS[speciesId].hp);f.startAggression();const a=f.waitForAttack(),hp=p.hp;f.input({type:'cancel'});
 const telegraph=sim.snapshot(p.id).groundEffects.find(e=>e.kind==='line');assert.ok(telegraph);assert.equal(telegraph.expiresAt,a.hitAt);assert.equal(telegraph.halfWidth,.9);assert.equal(telegraph.radius,.9);
 const attack=sim.events.find(e=>e.actor===m.uid&&e.attackKind==='aimed-line');assert.equal(a.hitAt-attack.at,1200);assert.equal(a.endsAt-a.hitAt,1600);
 f.advance(a.hitAt-sim.state.time-50);assert.equal(p.hp,hp);assert.equal(sim.events.some(e=>e.kind==='release'&&e.actor===m.uid),false);
 f.advance(100);const hits=sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id),releases=sim.events.filter(e=>e.kind==='release'&&e.actor===m.uid);
 assert.equal(hits.length,1);assert.equal(releases.length,1);assert.equal(releases[0].attackKind,'aimed-line');assert.equal(releases[0].durationMs,0);
 assert.equal(releases[0].effect,speciesId==='ice_golem'?'ice':'fire');assert.equal(releases[0].at,hits[0].at);
 assert.equal(hp-p.hp,resolveHeroDamageV3(MONSTERS[speciesId].atk*1.2,'magic',p.stats));
 assert.equal(sim.snapshot(p.id).groundEffects.some(e=>e.kind==='line'),false);
 assert.equal(m.targetId,p.id,'summon aggression targets owner as well');
});
test('real sidestep leaves fixed capsule before impact without homing, stun or forced positions',()=>{
 const f=prepareRangedControl(),{sim,p,m}=f;f.startAggression();const a=f.waitForAttack(),hp=p.hp,endpoint=structuredClone(a.counter.endPoint),start={x:p.x,z:p.z};
 f.input({type:'destination',x:f.sidestep.x,z:f.sidestep.z});f.advance(a.hitAt-sim.state.time+100);
 assert.ok(gap(start,p)>3);assert.deepEqual(a.counter.endPoint,endpoint);assert.equal(p.hp,hp);
 assert.equal(sim.events.filter(e=>e.kind==='release'&&e.actor===m.uid).length,1);assert.equal(sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid).length,0);
});
test('a physical wall introduced after warning blocks contact; target and cooldown are not reset by LOS loss',()=>{
 const f=prepareRangedControl(),{sim,p,m,geography}=f;f.startAggression();const a=f.waitForAttack();f.advance(400);
 const hp=p.hp,monsterHp=m.hp,deadline=m.nextCounterAt;
 // Isolated collision-contract fixture, not a claimed new wall in the authored map.
 const x=(p.x+m.x)/2,z=(p.z+m.z)/2;geography.space(m).collision.addBox(x,z,.25,3,0);
 assert.equal(sim.lineOfSight(m,p),false);f.advance(a.hitAt-sim.state.time+100);
 assert.equal(p.hp,hp);assert.equal(m.hp,monsterHp);assert.equal(m.nextCounterAt,deadline);assert.equal(m.targetId,p.id);
 assert.equal(sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid).length,0);
});
test('warning endpoint is clipped against collision and terrain rather than drawing a full beam through walls',()=>{
 const f=prepareRangedControl(),{sim,p,m,geography}=f;
 const dx=(p.x-m.x)/11,dz=(p.z-m.z)/11;
 // Behind the hero: preserves acquisition/first shot, but clips the far end of the warning.
 geography.space(m).collision.addCircle(m.x+dx*14,m.z+dz*14,.5);
 f.startAggression();const a=f.waitForAttack();assert.ok(gap(a.counter.origin,a.counter.endPoint)<14);
 assert.ok(gap(a.counter.origin,a.counter.endPoint)>gap(a.counter.origin,p));
});
test('cooldown is at least seven seconds and the monster chases instead of waiting at sixteen metres',()=>{
 const f=prepareRangedControl(),{sim,p,m}=f;f.startAggression();const first=f.waitForAttack(),before={x:m.x,z:m.z};f.advance(first.hitAt-sim.state.time+100);
 const dx=(p.x-m.x)/gap(p,m),dz=(p.z-m.z)/gap(p,m);f.input({type:'destination',x:p.x+dx*6,z:p.z+dz*6});
 const end=sim.state.time+11000;
 while(sim.state.time<end&&sim.events.filter(e=>e.kind==='attack'&&e.actor===m.uid&&e.attackKind==='aimed-line').length<2)f.advance(50);
 const attacks=sim.events.filter(e=>e.kind==='attack'&&e.actor===m.uid&&e.attackKind==='aimed-line');assert.equal(attacks.length,2);
 assert.ok(attacks[1].at-attacks[0].at>=7000);assert.ok(gap(before,m)>1,'real pursuit during cooldown');
});
test('cancel/death/space/generation invalidate warning and cannot deliver a delayed hit',()=>{
 for(const change of ['death','space','generation','cancel']){
  const f=prepareRangedControl(),{sim,p,m}=f;f.startAggression();const a=f.waitForAttack(),hp=p.hp,deadline=m.nextCounterAt;
  if(change==='death')sim.damage(m,m.hp+1,p,false); // Explicit death-transition fixture, not a combat-duration claim.
  else if(change==='space')p.spaceId='mine';
  else if(change==='generation')p.generation++;
  else sim.cancelAttack(m.uid);
  f.advance(a.hitAt-sim.state.time+100);assert.equal(p.hp,hp,change);assert.equal(sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid).length,0,change);
  assert.equal(sim.snapshot(p.id).groundEffects.some(e=>e.id.includes(':counter:')),false,change);assert.equal(m.nextCounterAt,deadline,change);
 }
});
test('starter cave respects nine-second slam cooldown and every intervening slash is a real melee contact',()=>{
 const f=prepareRangedControl({speciesId:'cave_boss',classId:'necro',level:40}),{sim,p,m}=f;
 f.startAggression();const a=f.waitForAttack(a=>Boolean(a.slam)),attack=sim.events.find(e=>e.kind==='attack'&&e.actor===m.uid);
 assert.equal(a.hitAt-attack.at,1400);assert.equal(sim.monsterRange(m),13);assert.equal(sim.snapshot(p.id).groundEffects.find(e=>e.kind==='slam').radius,4);
 const start=sim.state.time;let meleeHits=0;
 while(sim.state.time-start<15000&&sim.events.filter(e=>e.kind==='attack'&&e.actor===m.uid&&e.effect==='slam').length<2){
  const hp=p.hp;f.advance(50);const pending=sim.state.pending.find(a=>a.actor===m.uid);
  if(p.hp<hp&&pending&&!pending.slam){meleeHits++;assert.ok(gap(p,m)<2.54);}
 }
 const slams=sim.events.filter(e=>e.kind==='attack'&&e.actor===m.uid&&e.effect==='slam');assert.equal(slams.length,2);assert.ok(slams[1].at-slams[0].at>=9000);assert.ok(meleeHits>0);
 assert.equal(m.hp,MONSTERS.cave_boss.hp-sim.events.filter(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid).reduce((n,e)=>n+e.amount,0));
});
test('legacy mode retains old cave cadence and no aimed-line actions, while four boss records survive candidate restart',()=>{
 const old=prepareRangedControl({speciesId:'cave_boss',classId:'necro',level:40,mode:'legacy'});old.startAggression();old.waitForAttack(a=>Boolean(a.slam));old.advance(5000);
 const slams=old.sim.events.filter(e=>e.kind==='attack'&&e.actor===old.m.uid&&e.effect==='slam');assert.ok(slams.length>=2);assert.ok(slams[1].at-slams[0].at<9000);
 assert.equal(old.sim.events.some(e=>e.attackKind==='aimed-line'),false);
 const legacyFire=prepareRangedControl({mode:'legacy'});assert.equal(legacyFire.sim.rangedResponse(legacyFire.m),null);
 const f=prepareRangedControl({isolated:false}),{sim,p,m,geography}=f;f.startAggression();f.waitForAttack();const deadline=m.nextCounterAt,hp=m.hp;
 const bosses=structuredClone(sim.state.monsters.filter(x=>geography.slotById.get(x.uid)?.boss));sim.checkpoint();
 const restored=makeP2Simulation({geography,store:sim.store,now:sim.state.time}),current=restored.state.monsters.find(x=>x.uid===m.uid);
 assert.equal(current.nextCounterAt,deadline);assert.equal(current.hp,hp);assert.equal(restored.state.pending.some(a=>a.counter),false);
 for(const b of bosses){const after=restored.state.monsters.find(x=>x.uid===b.uid);for(const key of ['hp','alive','respawnAt','generation','deathAt','corpseUntil'])assert.equal(after[key],b[key],b.uid+'/'+key);}
 assert.equal(restored.state.monsters.length,1151);assert.equal(restored.snapshot(p.id).groundEffects.some(e=>e.kind==='line'),false);
});
test('new circle evidence records responses without demanding a hit against legitimate movement; old definitions remain exact',()=>{
 const r=JSON.parse(readFileSync('docs/world-expansion-v3/RANGED_RESPONSE_CONTROL.json','utf8'));
 assert.equal(r.sourcesChangedDuringRun,false);assert.equal(r.circle.enemyAttacks,5);assert.equal(r.circle.failure,null);assert.equal(r.circle.targetHpResets,0);
 assert.equal(r.circle.damageTaken,0);assert.equal(r.circle.killed,true);assert.equal(r.circle.loot.length,1);
 assert.equal(JSON.stringify(MONSTERS),definitionsBefore);
});
test('closed-process time preserves the remaining new counter cooldown, and a real respawn clears old generation deadlines',()=>{
 const f=prepareRangedControl({isolated:false}),{sim,p,m,geography}=f;f.startAggression();f.waitForAttack();sim.checkpoint();
 const remaining=m.nextCounterAt-sim.state.time,closedMs=3*86400000;
 const restored=makeP2Simulation({geography,store:sim.store,now:sim.state.time+closedMs}),current=restored.state.monsters.find(x=>x.uid===m.uid);
 assert.equal(current.nextCounterAt-restored.state.time,remaining);assert.equal(restored.state.pending.some(a=>a.counter),false);
 // Lifecycle fixture: a real server death transition, not an accelerated combat claim.
 sim.damage(m,m.hp+1,p,false);const oldGeneration=m.generation;assert.equal(sim.state.pending.some(a=>a.actor===m.uid),false);
 assert.equal(sim.events.filter(e=>e.kind==='loot'&&e.target===m.uid).length,1);
 // Exercise the ordinary disconnected catch-up path, without simulating a
 // minute of unrelated full-population patrol or modifying the respawn timer.
 sim.disconnect(p.id);sim.advance(m.respawnAt+20);assert.equal(m.alive,true);assert.equal(m.generation,oldGeneration+1);
 assert.equal(m.nextCounterAt,undefined);assert.equal(sim.state.pending.some(a=>a.counter&&a.actorGeneration===oldGeneration),false);
 assert.equal(sim.events.filter(e=>e.kind==='loot'&&e.target===m.uid).length,1);
});
