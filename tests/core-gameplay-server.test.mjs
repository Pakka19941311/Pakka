import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterMotor, JUMP_SPEED, JUMP_GRAVITY } from '../src/controls/character-motor.ts';
import { combatSpacing, approachPoint, facingTarget } from '../src/combat/combat-approach.ts';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { CLASSES, MONSTERS } from '../src/data/game-data.ts';
import { classAttackRange } from '../src/core/game-rules.ts';

function fixture(classId='knight') {
  const collision=new CollisionWorld();let id=0;
  const store={load:()=>null,save:()=>{},receipt:()=>null,commit:()=>{}};
  const world=new WorldSimulation({store,collision,now:1000,identifier:()=>`core-${++id}`,random:()=>.5});
  const p=world.createCharacter('Core',classId);Object.assign(p,{x:40,z:40,yaw:0,hp:99999,maxHp:99999});
  world.heartbeat(p.id);
  const m=world.state.monsters.find(m=>m.id==='wolf');Object.assign(m,{x:40,z:60,home:{x:40,z:60},hp:99999,regionId:undefined});m.status.stun=1e9;
  world.state.monsters=[m];
  const input=intent=>world.input(p.id,++id,intent);
  const advance=ms=>{for(let left=ms;left>0;left-=50){world.heartbeat(p.id);world.advance(world.state.time+Math.min(50,left));}};
  return {world,p,m,collision,input,advance};
}
const planarDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Numerical jump/FPS parity now lives in reference-server.test.mjs and uses
// traces executed from the accepted browser commit, rather than an analytic
// variable-delta trajectory that was never used by that build.

test('cancel, destination replacement and target death never reset an airborne motor',()=>{
  const f=fixture();f.world.state.monsters=[];f.input({type:'jump'});f.advance(200);
  const height=f.p.yOffset;f.input({type:'cancel'});assert.equal(f.p.grounded,false);assert.equal(f.p.yOffset,height);
  f.input({type:'destination',x:45,z:40});assert.equal(f.p.yOffset,height);f.advance(50);assert.ok(f.p.yOffset>height);
  f.input({type:'jump'});f.advance(550);assert.equal(f.p.grounded,true);assert.equal(f.p.yOffset,0);
  const g=fixture('ranger');g.m.z=48;g.m.home.z=48;g.m.hp=1;g.input({type:'attack',entityId:g.m.uid,skill:null});
  while(!g.world.events.some(e=>e.kind==='release'))g.advance(50);
  g.input({type:'jump'});g.advance(300);assert.equal(g.m.alive,false);assert.equal(g.p.grounded,false);assert.ok(g.p.yOffset>1);
});

test('blocked WASD publishes zero resolved velocity and idle animation, and stops without stored creep',()=>{
  const f=fixture();f.world.state.monsters=[];f.collision.addBox(41,40,.1,5,0,0,10);
  for(let i=0;i<40;i++){f.input({type:'direction',x:1,z:0});f.advance(50);}
  assert.ok(f.p.x<=40.441);assert.ok(Math.abs(f.p.velocityX)<.001);assert.equal(f.p.action,'idle');
  f.input({type:'cancel'});const x=f.p.x;f.advance(1000);assert.equal(f.p.x,x);
});

test('click path goes round static geometry, stops once, and WASD replaces it immediately',()=>{
  const f=fixture();f.world.state.monsters=[];f.collision.addBox(44,40,.5,2,0,0,10);
  f.input({type:'destination',x:49,z:40});
  for(let i=0;i<120;i++){f.advance(50);assert.equal(f.collision.isBlocked(f.p,.46),false);}
  assert.ok(Math.hypot(f.p.x-49,f.p.z-40)<.2);assert.equal(f.p.destination,null);const at={x:f.p.x,z:f.p.z};f.advance(500);assert.deepEqual({x:f.p.x,z:f.p.z},at);
  f.input({type:'destination',x:40,z:40});f.advance(50);f.input({type:'direction',x:0,z:1});assert.equal(f.p.destination,null);assert.equal(f.p.target,null);const z=f.p.z;f.advance(100);assert.ok(f.p.z>z);
});

for(const classId of Object.keys(CLASSES))test(`${classId} approach stops outside bodies and within unchanged attack range`,()=>{
  const f=fixture(classId);f.input({type:'attack',entityId:f.m.uid,skill:null});
  let attack;
  for(let i=0;i<180&&!attack;i++){f.advance(50);attack=f.world.events.find(e=>e.kind==='attack'&&e.actor===f.p.id);assert.ok(planarDistance(f.p,f.m)>=2.075-.01);}
  assert.ok(attack);const d=planarDistance(f.p,f.m),range=classAttackRange(classId);
  assert.ok(d<=range+.0001);assert.ok(d>=combatSpacing(range,.46,1.615).stoppingDistance-f.p.stats.speed/60-.0001);
  assert.ok(facingTarget(f.p.yaw,f.p,f.m));
});

test('occluded LMB target is rejected; obstruction after selection finds a firing angle without entering target',()=>{
  const f=fixture('ranger');f.m.z=50;f.m.home.z=50;
  f.collision.addBox(40,45,1,.3,0,0,10);
  assert.throws(()=>f.input({type:'attack',entityId:f.m.uid,skill:null}),/target-occluded/);
  const g=fixture('ranger');g.m.z=50;g.m.home.z=50;
  g.input({type:'attack',entityId:g.m.uid,skill:null});g.collision.addBox(40,45,1,.3,0,0,10);
  for(let i=0;i<120;i++){g.advance(50);assert.ok(planarDistance(g.p,g.m)>2.1);}
  assert.ok(g.world.events.some(e=>e.kind==='release'&&e.actor===g.p.id));
});

test('target death clears all combat intents immediately; ordered impact/death/loot carries authoritative HP',()=>{
  const f=fixture('ranger');f.m.z=48;f.m.home.z=48;f.m.hp=1;
  f.input({type:'attack',entityId:f.m.uid,skill:null});f.advance(1500);
  const events=f.world.events,attack=events.find(e=>e.kind==='attack'),release=events.find(e=>e.kind==='release'),hit=events.find(e=>e.kind==='hit'),death=events.find(e=>e.kind==='death'),loot=events.find(e=>e.kind==='loot');
  assert.ok(attack.at<release.at&&release.at+280<=hit.at);assert.ok(hit.sequence<death.sequence&&death.sequence<loot.sequence);
  assert.equal(hit.targetHp,0);assert.equal(hit.targetGeneration,f.m.generation);assert.equal(death.generation,f.m.generation);
  assert.equal(f.m.action,'death');assert.equal(f.m.combatState,'dead');assert.equal(f.m.targetId,null);assert.equal(f.p.target,null);assert.equal(f.p.autoAttack,false);
  assert.equal(f.world.state.pending.some(a=>a.actor===f.m.uid||a.target===f.m.uid),false);
  assert.ok(f.world.snapshot(f.p.id).monsters[0].aiState!=='idle');
  f.advance(3000);assert.equal(f.world.snapshot(f.p.id).monsters[0].aiState,'despawn');
});

test('monster turns during reference windup, retains target, and only damages after visible release',()=>{
  const f=fixture();f.m.status.stun=0;f.m.z=42.15;f.m.home.z=42.15;f.m.yaw=0;f.m.attackReadyAt=0;
  f.advance(50);assert.ok(f.world.events.some(e=>e.kind==='attack'),'reference begins visible windup without a separate rotation wait');assert.equal(f.world.events.some(e=>e.kind==='hit'),false,'windup cannot damage backwards');
  f.advance(1500);const attack=f.world.events.find(e=>e.kind==='attack'&&e.actor===f.m.uid),hit=f.world.events.find(e=>e.kind==='hit'&&e.actor===f.m.uid);
  assert.ok(attack&&hit);assert.ok(attack.at<hit.at&&hit.at>=attack.impactAt);assert.ok(f.world.events.some(e=>e.kind==='release'&&e.actor===f.m.uid&&e.at===hit.at));
  assert.equal(f.m.targetId,f.p.id);assert.ok(facingTarget(f.m.yaw,f.m,f.p));
});

test('overlapping monster crowd separates without static penetration and dead bodies stop blocking',()=>{
  const f=fixture();const clone=structuredClone(f.m);clone.uid='overlap';f.world.state.monsters.push(clone);
  f.advance(2000);assert.ok(planarDistance(f.m,clone)>=3.229);
  f.m.alive=false;clone.alive=false;f.m.respawnAt=clone.respawnAt=1e9;
  f.input({type:'destination',x:f.m.x,z:f.m.z});f.advance(5000);assert.ok(planarDistance(f.p,f.m)<.2);
});

test('motion snapshot exposes resolved physics and a vetted path, never a target-centre movement request',()=>{
  const f=fixture();f.input({type:'destination',x:46,z:40});f.advance(100);
  const snapshot=f.world.snapshot(f.p.id);
  assert.ok(snapshot.character.velocityX>0);assert.equal(snapshot.character.verticalVelocity,0);
  assert.equal(snapshot.character.bodyRadius,.46);assert.equal(snapshot.character.attackRange,2.6);
  assert.ok(snapshot.character.navigationPath.length);assert.ok(snapshot.monsters[0].bodyRadius>0);
  assert.deepEqual(approachPoint({x:0,z:0},{x:0,z:0},3),{x:3,z:0});
});

test('world AI patrols for 60 seconds at walking speed, pauses, and stays in its home area',()=>{
  let serial=0;const world=new WorldSimulation({store:{load:()=>null,save:()=>{}},collision:new CollisionWorld(),now:1000,identifier:()=>`patrol-${++serial}`,random:()=>.5});
  const p=world.createCharacter('Observer','knight'),m=world.state.monsters.find(m=>m.id==='wolf');world.state.monsters=[m];const states=new Set();
  for(let tick=0;tick<1200;tick++){
    const before={x:m.x,z:m.z};world.heartbeat(p.id);world.advance(world.state.time+50);
    assert.ok(planarDistance(before,m)<=2.25*.05+.00001);assert.ok(planarDistance(m,m.home)<14.2);
    const snapshot=world.snapshot(p.id).monsters[0];states.add(snapshot.aiState);
    if(m.action==='walk')assert.ok(Math.hypot(m.velocityX,m.velocityZ)>.001);
  }
  assert.ok(states.has('idle')&&states.has('patrol'));
});

test('world AI retains a selected player when another becomes nearer and returns after the target leaves',()=>{
  const f=fixture();f.m.status.stun=0;f.m.z=48;f.m.home.z=48;f.advance(500);assert.equal(f.m.targetId,f.p.id);
  const other=f.world.createCharacter('Other','knight');Object.assign(other,{x:f.m.x+3,z:f.m.z});f.world.heartbeat(other.id);f.advance(50);assert.equal(f.m.targetId,f.p.id);
  Object.assign(f.p,{x:70,z:70});Object.assign(other,{x:75,z:75});const states=new Set();
  for(let i=0;i<150;i++){f.advance(50);states.add(f.world.snapshot(f.p.id).monsters[0].aiState);}
  assert.ok(states.has('leash')||states.has('return'));assert.ok(planarDistance(f.m,f.m.home)<.6);assert.equal(f.m.targetId,null);
});

test('summoned monster damage also waits for animation contact instead of its cooldown tick',()=>{
  const f=fixture('necro');f.m.z=42.4;f.m.home.z=42.4;
  f.world.state.summons.push({uid:'summon',owner:f.p.id,x:40,z:40,yOffset:0,grounded:true,yaw:0,action:'idle',actionStartedAt:1000,actionEndsAt:0,attackReadyAt:0,expiresAt:10000});
  let attack;for(let i=0;i<20&&!attack;i++){f.advance(50);attack=f.world.events.find(e=>e.kind==='attack'&&e.actor==='summon');}assert.ok(attack);assert.equal(f.m.hp,99999);
  while(f.world.state.time<attack.impactAt)f.advance(Math.min(50,attack.impactAt-f.world.state.time));
  assert.ok(f.m.hp<99999);assert.ok(f.world.events.some(e=>e.kind==='release'&&e.actor==='summon'));
});
