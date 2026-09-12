import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { restoreWorldTopology } from '../src/world/world-topology.ts';
import { CLASSES, MONSTERS } from '../src/data/game-data.ts';
import { SKILL_BOOKS } from '../src/data/skill-books.ts';
import { SERVICES } from '../src/world/territory.ts';

function fixture(t, classId='knight', monsterId='wolf', actualMap=false) {
  const dir=mkdtempSync(join(tmpdir(),'varendor-recovery-'));
  const store=new WorldStore(join(dir,'world.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const topology=actualMap?restoreWorldTopology(JSON.parse(readFileSync('public/assets/world/world-topology.json','utf8'))):{collision:new CollisionWorld()};
  let serial=0;
  const world=new WorldSimulation({store,...topology,now:1000,identifier:()=>`recovery-${++serial}`,random:()=>.01,beta:true});
  const p=world.createCharacter('Проверка',classId);
  Object.assign(p,{x:30,z:24});world.heartbeat(p.id);
  const m=world.state.monsters.find(m=>m.id===monsterId);
  Object.assign(m,{x:30,z:30,home:{x:30,z:30},hp:MONSTERS[monsterId].hp});
  m.status.stun=100000;world.state.monsters=[m];
  const observedEvents=[];let seenSequence=0;
  const advance=(ms)=>{for(let left=ms;left>0;left-=50){
    world.heartbeat(p.id);world.advance(world.state.time+Math.min(left,50));
    // Observe the live stream as a client does. A deterministic DOT roll can
    // legitimately evict an early release from the bounded server event ring.
    for(const event of world.events)if(event.sequence>seenSequence){observedEvents.push(event);seenSequence=event.sequence;}
  }};
  return {world,p,m,advance,observedEvents,collision:topology.collision};
}

for(const classId of Object.keys(CLASSES))for(const monsterId of ['wolf','mini']) {
  test(`LMB attack reaches ${monsterId} with ${classId} despite body separation`,t=>{
    const {world,p,m,advance}=fixture(t,classId,monsterId);
    world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});advance(6000);
    assert.ok(world.events.some(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid),'approach must end in an actual server hit');
    assert.ok(m.hp<MONSTERS[monsterId].hp);
  });
}

for(const classId of Object.keys(CLASSES)) {
  test(`${classId}: legacy numeric skills cannot bypass owned books`,t=>{
    const {world,p,m}=fixture(t,classId,'mini');
    const before=JSON.stringify([p.mp,p.cooldowns,m.hp,world.state.pending]);
    for(let index=0;index<4;index++)assert.throws(()=>world.input(p.id,index+1,{type:'attack',entityId:m.uid,skill:index}),/book-required/);
    assert.equal(JSON.stringify([p.mp,p.cooldowns,m.hp,world.state.pending]),before);
    assert.equal(world.events.filter(e=>e.actor===p.id&&['attack','release'].includes(e.kind)).length,0);
  });
}

for(const book of Object.values(SKILL_BOOKS)) {
  test(`${book.id}: owned book pays once, starts cooldown and produces its authoritative effect`,t=>{
    const {world,p,m}=fixture(t,book.classId,'mini');
    p.level=60;world.recalculate(p);p.mp=p.maxMp;p.z=m.z-1.5;
    p.inventory.push(world.item(book.id));
    const mp=p.mp,now=world.state.time;
    const command={type:'castBook',bookId:book.id,targetId:book.mode==='ally'?p.id:m.uid,point:{x:m.x,z:m.z}};
    const result=world.command(p.id,'book-owned-once',command);
    assert.equal(result.ok,true,result.reason);
    assert.equal(p.mp,mp-book.cost);assert.equal(p.bookCooldowns[book.id],now+book.cd*1000);
    assert.ok(world.events.some(e=>e.actor===p.id&&e.kind==='attack'&&e.bookId===book.id));
    if(book.mode==='area')assert.ok(world.state.bookAreas.some(a=>a.id===book.id&&a.owner===p.id));
    else if(book.mode==='trap')assert.ok(world.state.bookTraps.some(a=>a.owner===p.id));
    else assert.ok(world.events.some(e=>e.actor===p.id&&['release','buff','summon'].includes(e.kind)));
    const after=JSON.stringify([p,world.state.summons,world.state.bookAreas,world.state.bookTraps,world.events]);
    assert.deepEqual(world.command(p.id,'book-owned-once',command),result);
    assert.equal(JSON.stringify([p,world.state.summons,world.state.bookAreas,world.state.bookTraps,world.events]),after);
  });
}

test('Asterhold arrival is free on the shipped map and cancels all previous motion',t=>{
  const {world,p,advance,collision}=fixture(t,'knight','wolf',true);
  Object.assign(p,SERVICES['npc:teleport']);world.input(p.id,1,{type:'direction',x:1,z:0});
  const generation=p.generation;
  const receipt=world.command(p.id,'arrival-regression',{type:'teleport',destination:'Астерхолд'});
  assert.equal(receipt.ok,true);assert.equal(p.generation,generation+1);
  assert.equal(collision.isBlocked(p,.46),false);
  assert.ok(Math.hypot(p.x+98,p.z+84)<1);
  const arrival={x:p.x,z:p.z};advance(1000);
  assert.deepEqual({x:p.x,z:p.z},arrival);assert.equal(p.destination,null);assert.equal(p.target,null);
  assert.equal(p.yOffset,0);assert.equal(p.grounded,true);
});

test('loot event reports only the exact authoritative rewards added once',t=>{
  const {world,p,m,advance}=fixture(t);
  m.hp=1;const beforeGold=p.gold;
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});advance(4000);
  const events=world.events.filter(e=>e.kind==='loot'&&e.actor===p.id);
  assert.equal(events.length,1);const loot=events[0];
  assert.equal(loot.gold,p.gold-beforeGold);assert.equal(loot.xp,MONSTERS.wolf.xp);
  for(const id of loot.items)assert.ok([...p.inventory,...p.lootBuffer].some(i=>i.id===id));
  assert.ok(loot.items.includes('wolf_fang'));
});

test('manual movement cancels approach and never replays an older target',t=>{
  const {world,p,m,advance}=fixture(t);
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});advance(100);
  world.input(p.id,2,{type:'direction',x:-1,z:0});advance(200);
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});advance(200);
  assert.equal(p.target,null);assert.equal(p.autoAttack,false);assert.ok(p.x<30);
});
