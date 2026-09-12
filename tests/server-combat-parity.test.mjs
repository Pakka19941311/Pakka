import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { CharacterMotor } from '../src/controls/character-motor.ts';
import { SKILL_BOOKS } from '../src/data/skill-books.ts';
import { SERVICES } from '../src/world/territory.ts';

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

test('basic attack retains measured rig release; leaving range during windup cancels without resource payment',t=>{
  const f=fixture(t);const {world:w,player:p,target:m}=f;const event=f.attack();
  const gltf=JSON.parse(readFileSync(new URL('../public/assets/models/characters/Wizard.gltf',import.meta.url),'utf8'));
  const clip=gltf.animations.find(a=>a.name==='Spell1');const access=gltf.accessors[clip.samplers[0].input];
  const duration=Math.min(access.max[0]-access.min[0],(event.readyAt-event.at)/1000*.92);
  const expectedTicks=Math.ceil(duration*.56*60-1e-6);
  assert.ok(Math.abs(event.impactAt-event.at-expectedTicks*1000/60)<.01,'contact is the first fixed reference tick at or after the rig marker');
  assert.equal(p.mp,p.maxMp);assert.equal(p.cooldowns[0],0);
  m.z=15;w.advance(event.impactAt+1);
  assert.equal(p.mp,p.maxMp);assert.equal(p.cooldowns[0],0);assert.equal(m.hp,10000);
  assert.ok(w.events.some(e=>e.kind==='cancel'&&e.reason==='out-of-reach'));
});

test('ranged release schedules one 280 ms projectile; a new target generation cannot receive its old hit',t=>{
  const f=fixture(t);const {world:w,player:p,target:m}=f;const event=f.attack();
  w.advance(event.impactAt);assert.equal(p.mp,p.maxMp);assert.equal(m.hp,10000);
  const release=w.events.find(e=>e.kind==='release');assert.equal(release.durationMs,280);
  assert.equal(p.cooldowns[0],0);assert.equal(w.state.projectiles.length,1);
  w.advance(release.at+279);assert.equal(m.hp,10000);
  m.generation++;w.advance(release.at+300);assert.equal(m.hp,10000);assert.equal(w.state.projectiles.length,0);
});

function learn(w,p,level){p.level=Math.max(p.level,level);w.recalculate(p);p.mp=p.maxMp;const id=`book_${p.classId}_${level}`;p.inventory.push(w.item(id));return id;}

test('recovery rejects legacy skill indices but permits an owned book through its independent command contract',t=>{
  const f=fixture(t,'knight');const {world:w,player:p}=f;const book=learn(w,p,20),first=f.attack();
  assert.throws(()=>f.input({type:'attack',entityId:f.target.uid,skill:1}),/book-required/);
  w.advance(first.endsAt-300);assert.ok(w.events.some(e=>e.kind==='hit'));
  const mp=p.mp,now=w.state.time;const result=w.command(p.id,'owned-book-during-recovery',{type:'castBook',bookId:book});
  assert.equal(result.ok,true,result.reason);assert.equal(p.mp,mp-SKILL_BOOKS[book].cost);assert.equal(p.bookCooldowns[book],now+120000);
  assert.ok(p.bookEffects.some(e=>e.id===book));assert.equal(p.cooldowns[1],0);
  w.advance(first.endsAt+60);assert.equal(w.events.filter(e=>e.kind==='attack'&&e.bookId===book).length,1);
});

test('owned mage area independently rolls secondary hits after a primary MISS',t=>{
  const f=fixture(t);const {world:w,player:p,target:m,rolls}=f;const book=learn(w,p,50);
  Object.assign(p,{x:30,z:24});Object.assign(m,{x:30,z:29,home:{x:30,z:29}});
  const secondary=structuredClone(m);Object.assign(secondary,{uid:'secondary',x:31.4,z:29});w.state.monsters.push(secondary);
  const result=w.command(p.id,'area-independent-hits',{type:'castBook',bookId:book,point:{x:m.x,z:m.z}});assert.equal(result.ok,true,result.reason);
  rolls.push(0,.5);w.advance(w.state.time+1017);
  assert.equal(m.hp,10000);assert.ok(secondary.hp<10000);
  assert.ok(w.events.some(e=>e.kind==='miss'&&e.target===m.uid));assert.equal(w.events.filter(e=>e.kind==='hit').length,1);
});

test('owned mage area checks caster LOS for each target, while the removed legacy chain cannot be cast',t=>{
  const f=fixture(t);const {world:w,player:p,target:m,collision}=f;const book=learn(w,p,50);
  Object.assign(p,{x:30,z:24});Object.assign(m,{x:30,z:29,home:{x:30,z:29}});
  const behind=structuredClone(m);Object.assign(behind,{uid:'behind-wall',x:32,z:29});
  const farther=structuredClone(m);Object.assign(farther,{uid:'visible-farther',x:27,z:29});w.state.monsters.push(behind,farther);
  collision.addBox(31,26.5,.15,.6,0,0,10);
  assert.throws(()=>f.attack(2),/book-required/);
  const result=w.command(p.id,'area-per-target-los',{type:'castBook',bookId:book,point:{x:m.x,z:m.z}});assert.equal(result.ok,true,result.reason);w.advance(w.state.time+1017);
  assert.ok(m.hp<10000);assert.equal(behind.hp,10000);assert.ok(farther.hp<10000,'visible targets receive their own area pulse');
  assert.equal(w.state.projectiles.length,0);
});

test('server uses the shared acceleration/jump motor; no unrelated window command is required',t=>{
  const f=fixture(t,'ranger');const {world:w,player:p}=f;w.state.monsters=[];
  const reference=new CharacterMotor();f.input({type:'direction',x:1,z:0});let expected=0;
  for(let i=0;i<4;i++){for(let tick=0;tick<3;tick++)expected+=reference.step({x:1,z:0},p.stats.speed,1/60).dx;w.advance(w.state.time+50);}
  assert.ok(Math.abs(p.x-expected)<1e-9);
  f.input({type:'jump'});reference.requestJump();w.advance(w.state.time+50);
  let jump;for(let tick=0;tick<3;tick++){jump=reference.step({x:1,z:0},p.stats.speed,1/60);expected+=jump.dx;}
  assert.ok(Math.abs(p.x-expected)<1e-9);assert.equal(p.yOffset,jump.height);assert.equal(p.grounded,false);
  assert.throws(()=>f.input({type:'attack',entityId:f.target.uid,skill:null}),/missing-target|airborne/);
  const before=p.x;f.input({type:'direction',x:1,z:0});w.advance(w.state.time+200);assert.ok(p.x>before);
});

test('existing sell/drag and elder behavior remain atomic and preserve pre-quest kills',t=>{
  const f=fixture(t);const {world:w,player:p}=f;
  const weapon=structuredClone(p.equipment.weapon);
  let receipt=w.command(p.id,'unequip-position',{type:'unequip',slot:'weapon',index:0,item:weapon});
  assert.equal(receipt.ok,true);assert.equal(p.inventory[0].uid,weapon.uid);
  Object.assign(p,{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});
  const trade=w.command(p.id,'open-sell-once',{type:'tradeOpen',npcId:'npc:smith'}).outcome;
  receipt=w.command(p.id,'sell-item-once',{type:'sell',item:weapon,trade});assert.equal(receipt.ok,true);assert.equal(p.gold,320+Math.floor(140*.48));
  assert.deepEqual(w.command(p.id,'sell-item-once',{type:'sell',item:weapon,trade}),receipt);
  Object.assign(p,{x:SERVICES['npc:elder'].x,z:SERVICES['npc:elder'].z,kills:7});assert.equal(w.command(p.id,'elder-existing-kills',{type:'quest'}).ok,true);
  assert.equal(p.quest,1);assert.equal(p.kills,7);
});
