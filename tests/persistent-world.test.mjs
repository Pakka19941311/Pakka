import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';

function setup(t, options={}) {
  const dir=mkdtempSync(join(tmpdir(),'varendor-world-'));const filename=join(dir,'world.sqlite');
  let store=new WorldStore(filename);let serial=0;
  const create=(now=1000)=>new WorldSimulation({store,collision:options.collision??new CollisionWorld(),now,identifier:()=>`test-item-${++serial}`,random:()=>.5,beta:true});
  let world=create();
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {get world(){return world;},get store(){return store;},restart(now){store.close();store=new WorldStore(filename);world=create(now);return world;}};
}

test('one scroll mutation and the identical receipt survive retry and restart',t=>{
  const fixture=setup(t);const w=fixture.world;const p=w.createCharacter('Маг','mage');
  const weapon=structuredClone(p.equipment.weapon);const scroll=structuredClone(p.inventory.find(i=>i.id==='weapon_scroll'));
  const command={type:'enhance',item:weapon,scroll};
  const receipt=w.command(p.id,'enhance-operation-1',command);
  assert.equal(receipt.ok,true);assert.equal(receipt.outcome.to,1);
  assert.equal(w.state.characters[p.id].inventory.find(i=>i.id==='weapon_scroll').count,99);
  assert.deepEqual(w.command(p.id,'enhance-operation-1',command),receipt);
  const restored=fixture.restart(1500);
  assert.deepEqual(restored.command(p.id,'enhance-operation-1',command),receipt);
  assert.equal(restored.state.characters[p.id].equipment.weapon.plus,1);
  assert.equal(restored.state.characters[p.id].inventory.find(i=>i.id==='weapon_scroll').count,99);
  assert.throws(()=>restored.command(p.id,'enhance-operation-1',{type:'respawn'}),/command-id-conflict/);
});

test('failed durable write rolls back the equipment and scroll together',t=>{
  const f=setup(t);const p=f.world.createCharacter('Рыцарь','knight');
  const before=structuredClone(p);const commit=f.store.commit;
  f.store.commit=()=>{throw Error('disk-full');};
  assert.throws(()=>f.world.command(p.id,'enhance-operation-2',{type:'enhance',item:p.equipment.weapon,scroll:p.inventory.find(i=>i.id==='weapon_scroll')}),/disk-full/);
  assert.deepEqual(f.world.state.characters[p.id],before);f.store.commit=commit;
});

test('a failed risky enhancement destroys the item, never restores it on stale retry',t=>{
  const f=setup(t);const p=f.world.createCharacter('Рыцарь','knight');p.equipment.weapon.plus=4;
  const command={type:'enhance',item:structuredClone(p.equipment.weapon),scroll:structuredClone(p.inventory.find(i=>i.id==='weapon_scroll'))};
  const result=f.world.command(p.id,'enhance-operation-3',command);
  assert.equal(result.outcome.success,false);assert.equal(f.world.state.characters[p.id].equipment.weapon,undefined);
  assert.equal(f.world.command(p.id,'enhance-operation-4',command).ok,false);
  assert.equal(f.world.state.characters[p.id].inventory.find(i=>i.id==='weapon_scroll').count,99);
});

test('boss deadline is absolute and expires after restart with zero players',t=>{
  const f=setup(t);const m=f.world.state.monsters.find(m=>m.id==='mini');
  m.alive=false;m.hp=0;m.respawnAt=4500;f.world.checkpoint();
  let w=f.restart(3000);assert.equal(w.state.monsters.find(m=>m.id==='mini').respawnAt,4500);
  assert.equal(w.state.monsters.find(m=>m.id==='mini').alive,false);
  w=f.restart(5000);assert.equal(w.state.monsters.find(m=>m.id==='mini').alive,true);
  assert.equal(Object.keys(w.state.characters).length,0);
});

test('movement is server-normalized, collides and stale inputs cannot restart it',t=>{
  const collision=new CollisionWorld();collision.addBox(-5,-11,.3,5,0,0,8);
  const f=setup(t,{collision});const w=f.world;const p=w.createCharacter('Игрок','ranger');w.heartbeat(p.id);
  w.input(p.id,1,{type:'direction',x:100000,z:0});w.advance(1400);
  assert.ok(p.x < -5.7);assert.ok(p.x > -7);
  w.input(p.id,2,{type:'cancel'});const stopped=p.x;
  w.input(p.id,1,{type:'direction',x:-1,z:0});w.advance(1800);
  assert.equal(p.x,stopped);assert.throws(()=>w.input(p.id,3,{type:'destination',x:NaN,z:2}),/invalid-position/);
});

test('two clients see one shared world and disconnected character remains for 30 seconds',t=>{
  const f=setup(t);const w=f.world;const a=w.createCharacter('Первый','mage');const b=w.createCharacter('Второй','knight');
  w.heartbeat(a.id);w.heartbeat(b.id);
  assert.equal(w.snapshot(a.id).heroes.length,2);
  assert.deepEqual(w.snapshot(a.id).monsters,w.snapshot(b.id).monsters);
  w.disconnect(a.id);w.advance(30_950);assert.ok(w.snapshot(b.id).heroes.some(p=>p.id===a.id));
  w.advance(31_050);assert.ok(!w.snapshot(b.id).heroes.some(p=>p.id===a.id));
  w.heartbeat(a.id);assert.equal(w.snapshot(a.id).heroes.filter(p=>p.id===a.id).length,1);
  assert.equal(Object.keys(w.state.characters).length,2);
});

test('no client can submit its own damage or buy scrolls',t=>{
  const f=setup(t);const w=f.world;const p=w.createCharacter('Тестер','mage');
  assert.equal(w.command(p.id,'forged-damage-1',{type:'damage',value:100000}).ok,false);
  p.x=.3;p.z=-7.8;
  assert.equal(w.command(p.id,'forged-scroll-1',{type:'buy',itemId:'weapon_scroll'}).ok,false);
  assert.equal(w.state.characters[p.id].gold,320);
});

test('server retains the existing aggro radius and committed return-to-home behavior',t=>{
  const f=setup(t);const w=f.world;const p=w.createCharacter('Дозор','knight');
  const m=w.state.monsters.find(m=>m.id==='wolf');w.state.monsters=[m];
  p.x=m.home.x+11;p.z=m.home.z;w.heartbeat(p.id);const hp=p.hp;
  w.advance(2000);assert.equal(p.hp,hp);assert.ok(!w.events.some(e=>e.kind==='attack'));
  m.x=m.home.x+15;m.z=m.home.z;p.x=m.x+1;p.z=m.z;
  w.advance(2600);const firstDistance=Math.hypot(m.x-m.home.x,m.z-m.home.z);
  w.advance(3200);assert.ok(Math.hypot(m.x-m.home.x,m.z-m.home.z)<firstDistance);
  assert.equal(p.hp,hp,'returning monster must not reacquire before reaching home');
});
