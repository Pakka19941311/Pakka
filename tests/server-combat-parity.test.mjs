import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { CharacterMotor } from '../src/controls/character-motor.ts';
import { CLASSES } from '../src/data/game-data.ts';

function fixture(t,cls='mage') {
  const directory=mkdtempSync(join(tmpdir(),'varendor-parity-'));const store=new WorldStore(join(directory,'world.sqlite'));
  t.after(()=>{store.close();rmSync(directory,{force:true,recursive:true});});
  let serial=0;const rolls=[];const collision=new CollisionWorld();
  const world=new WorldSimulation({store,collision,now:1000,identifier:()=>`parity-${++serial}`,random:()=>rolls.shift()??.5});
  const player=world.createCharacter('Тест',cls);world.heartbeat(player.id);Object.assign(player,{x:0,z:0,yaw:0});
  const target=world.state.monsters.find(m=>m.id==='exile');
  Object.assign(target,{x:0,z:cls==='knight'?2.3:5,hp:10000,home:{x:0,z:5}});target.status.stun=1e9;world.state.monsters=[target];
  const attack=(skill=null)=>{world.input(player.id,++serial,{type:'attack',entityId:target.uid,skill});world.advance(world.state.time+50);return world.events.findLast(e=>e.kind==='attack'&&e.actor===player.id);};
  return {world,player,target,collision,rolls,attack,input:intent=>world.input(player.id,++serial,intent)};
}

test('skill spends at measured rig release; leaving range during windup costs no MP or cooldown',t=>{
  const f=fixture(t);const {world:w,player:p,target:m}=f;const event=f.attack(0);
  const gltf=JSON.parse(readFileSync(new URL('../public/assets/models/characters/Wizard.gltf',import.meta.url),'utf8'));
  const clip=gltf.animations.find(a=>a.name==='Spell1');const access=gltf.accessors[clip.samplers[0].input];
  const duration=access.max[0]-access.min[0];
  assert.ok(Math.abs(event.impactAt-event.at-duration*.56*1000)<.01);
  assert.equal(p.mp,p.maxMp);assert.equal(p.cooldowns[0],0);
  m.z=15;w.advance(event.impactAt+1);
  assert.equal(p.mp,p.maxMp);assert.equal(p.cooldowns[0],0);assert.equal(m.hp,10000);
  assert.ok(w.events.some(e=>e.kind==='cancel'&&e.reason==='out-of-reach'));
});

test('ranged release schedules one 280 ms projectile; a new target generation cannot receive its old hit',t=>{
  const f=fixture(t);const {world:w,player:p,target:m}=f;const event=f.attack(0);
  w.advance(event.impactAt);assert.equal(p.mp,p.maxMp-CLASSES.mage.skills[0].cost);assert.equal(m.hp,10000);
  const release=w.events.find(e=>e.kind==='release');assert.equal(release.durationMs,280);
  assert.equal(p.cooldowns[0],release.at+3500);
  w.advance(release.at+279);assert.equal(m.hp,10000);
  m.generation++;w.advance(release.at+300);assert.equal(m.hp,10000);assert.equal(w.state.projectiles.length,0);
});

test('recovery admits one 350 ms buffered skill and permits it before the basic attack cooldown',t=>{
  const f=fixture(t,'knight');const {world:w,player:p}=f;const first=f.attack();
  assert.throws(()=>f.input({type:'attack',entityId:f.target.uid,skill:1}),/attack-in-progress/);
  w.advance(first.endsAt-300);assert.ok(w.events.some(e=>e.kind==='hit'));
  f.input({type:'attack',entityId:f.target.uid,skill:1});
  assert.equal(p.cooldowns[1],0);assert.equal(p.mp,p.maxMp);
  w.advance(first.endsAt+60);
  const next=w.events.findLast(e=>e.kind==='attack'&&e.actor===p.id);
  assert.equal(next.skill,1);assert.ok(next.at<p.attackReadyAt);assert.equal(p.cooldowns[1],0);
  w.advance(next.impactAt);assert.ok(p.cooldowns[1]>w.state.time);assert.ok(f.target.status.stun>w.state.time);
});

test('area skill independently rolls secondary hits after a primary MISS',t=>{
  const f=fixture(t,'knight');const {world:w,target:m,rolls}=f;
  const secondary=structuredClone(m);Object.assign(secondary,{uid:'secondary',x:1.4,z:2.3});w.state.monsters.push(secondary);
  const event=f.attack(2);rolls.push(0,.5);w.advance(event.impactAt);
  assert.equal(m.hp,10000);assert.ok(secondary.hp<10000);
  assert.ok(w.events.some(e=>e.kind==='miss'&&e.target===m.uid));
  assert.equal(w.events.filter(e=>e.kind==='hit').length,1);
});

test('chain lightning retains instantaneous hops and stops at the first occluded segment',t=>{
  const f=fixture(t);const {world:w,target:m,collision}=f;
  const behind=structuredClone(m);Object.assign(behind,{uid:'behind-wall',x:2,z:5});
  const farther=structuredClone(m);Object.assign(farther,{uid:'visible-farther',x:-3,z:5});w.state.monsters.push(behind,farther);
  collision.addBox(1,5,.15,1,0,0,10);
  const event=f.attack(2);w.advance(event.impactAt);
  assert.ok(m.hp<10000);assert.equal(behind.hp,10000);assert.equal(farther.hp,10000,'accepted chain does not route around the blocked nearest link');
  assert.equal(w.state.projectiles.length,0);
});

test('server uses the shared acceleration/jump motor; no unrelated window command is required',t=>{
  const f=fixture(t,'ranger');const {world:w,player:p}=f;w.state.monsters=[];
  const reference=new CharacterMotor();f.input({type:'direction',x:1,z:0});let expected=0;
  for(let i=0;i<4;i++){expected+=reference.step({x:1,z:0},p.stats.speed,.05).dx;w.advance(w.state.time+50);}
  assert.ok(Math.abs(p.x-expected)<1e-9);
  f.input({type:'jump'});reference.requestJump();w.advance(w.state.time+50);
  const jump=reference.step({x:1,z:0},p.stats.speed,.05);expected+=jump.dx;
  assert.ok(Math.abs(p.x-expected)<1e-9);assert.equal(p.yOffset,jump.height);assert.equal(p.grounded,false);
  assert.throws(()=>f.input({type:'attack',entityId:f.target.uid,skill:0}),/missing-target|airborne/);
  const before=p.x;f.input({type:'direction',x:1,z:0});w.advance(w.state.time+200);assert.ok(p.x>before);
});

test('existing sell/drag and elder behavior remain atomic and preserve pre-quest kills',t=>{
  const f=fixture(t);const {world:w,player:p}=f;
  const weapon=structuredClone(p.equipment.weapon);
  let receipt=w.command(p.id,'unequip-position',{type:'unequip',slot:'weapon',index:0,item:weapon});
  assert.equal(receipt.ok,true);assert.equal(p.inventory[0].uid,weapon.uid);
  receipt=w.command(p.id,'sell-item-once',{type:'sell',item:weapon});assert.equal(receipt.ok,true);assert.equal(p.gold,320+Math.floor(140*.48));
  assert.deepEqual(w.command(p.id,'sell-item-once',{type:'sell',item:weapon}),receipt);
  Object.assign(p,{x:-7,z:-2.6,kills:7});assert.equal(w.command(p.id,'elder-existing-kills',{type:'quest'}).ok,true);
  assert.equal(p.quest,1);assert.equal(p.kills,7);
});
