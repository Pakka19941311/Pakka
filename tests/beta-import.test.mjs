import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { CLASSES } from '../src/data/game-data.ts';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { startWorldServer } from '../server/http-server.mjs';
import { CollisionWorld } from '../src/world/collision-world.ts';

const item=(id,plus=0,count=1)=>({uid:randomUUID(),id,plus,count});
function localSave(){return {schema:2,savedAt:1000,betaScrollGrant:'beta-scrolls-100-v1',quest:2,kills:8,bossKills:1,
  player:{name:'Перенос',classId:'knight',level:7,xp:126,gold:1543,x:-7,z:-11,hp:301,mp:70,dead:false,
    stats:{atk:999999999},maxHp:999999999,maxMp:999999999,
    inventory:[item('weapon_scroll',0,99),item('weapon_scroll_improved',0,100),item('armor_scroll',0,100),item('armor_scroll_improved',0,100)],
    equipment:{weapon:item(CLASSES.knight.weapon,7),chest:item(CLASSES.knight.armor,2)}},lootBuffer:[],settings:{quality:'low'}};}
function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'varendor-import-')),file=join(dir,'world.sqlite');let store=new WorldStore(file);
  const create=()=>new WorldSimulation({store,collision:new CollisionWorld(),now:1000,identifier:randomUUID,beta:true});let world=create();
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {get store(){return store;},get world(){return world;},restart(){store.close();store=new WorldStore(file);world=create();return world;}};
}
test('retry and restart recover the same imported hero without extra scrolls; source and server backup survive',t=>{
  const f=setup(t),original=localSave(),before=structuredClone(original),id=randomUUID();
  const p=f.world.importCharacter(id,original);
  assert.equal(p.level,7);assert.equal(p.gold,1543);assert.equal(p.xp,126);assert.equal(p.equipment.weapon.plus,7);
  assert.equal(p.inventory.find(i=>i.id==='weapon_scroll').count,99);
  assert.notEqual(p.equipment.weapon.uid,original.player.equipment.weapon.uid);
  assert.ok(Number.isFinite(p.stats.atkMax)&&p.stats.atkMax<999999999);
  assert.equal(Object.hasOwn(p.stats,'atk'),false);assert.ok(p.maxHp<999999999);
  assert.deepEqual(original,before);
  const stored=JSON.parse(f.store.db.prepare('SELECT original FROM imports WHERE character=?').get(p.id).original);
  assert.deepEqual(stored,before);
  assert.equal(f.world.importCharacter(id,original).id,p.id);
  const w=f.restart();assert.equal(w.importCharacter(id,original).id,p.id);assert.equal(Object.keys(w.state.characters).length,1);
  assert.throws(()=>w.importCharacter(id,{...original,kills:9}),/import-id-conflict/);
  assert.throws(()=>w.importCharacter(randomUUID(),original),/save-already-imported/);
});
test('legacy scrolls are archived and an existing death is not charged XP again',t=>{
  const f=setup(t),save=localSave();delete save.betaScrollGrant;save.schema=1;
  save.player.inventory=[item('scroll',0,7)];save.player.dead=true;save.player.hp=0;
  const p=f.world.importCharacter(randomUUID(),save);
  assert.equal(p.legacyScrolls,7);assert.equal(p.inventory.length,4);
  assert.ok(p.inventory.every(i=>i.count===100));assert.equal(p.dead,true);assert.equal(p.hp,0);assert.equal(p.xp,126);
});
test('corrupt data and a failed backup transaction leave no partially imported hero',t=>{
  const f=setup(t),bad=localSave();bad.player.inventory.push(item('unapproved-item'));
  assert.throws(()=>f.world.importCharacter(randomUUID(),bad),/invalid-beta-save/);
  assert.equal(Object.keys(f.world.state.characters).length,0);
  const original=localSave(),id=randomUUID(),backup=f.store.importBackup;
  f.store.importBackup=()=>{throw Error('backup-disk-full');};
  assert.throws(()=>f.world.importCharacter(id,original),/backup-disk-full/);
  assert.equal(Object.keys(f.world.state.characters).length,0);
  assert.equal(Object.keys(f.store.load().characters).length,0);assert.equal(f.store.imported(id,original),null);
  f.store.importBackup=backup;assert.ok(f.world.importCharacter(id,original).id);
});
test('HTTP import is disabled by default and cannot be enabled on a public listener',async t=>{
  assert.throws(()=>startWorldServer({database:':memory:',collision:new CollisionWorld(),beta:true,allowLocalImport:true,host:'0.0.0.0'}),/private loopback/);
  const running=startWorldServer({database:':memory:',collision:new CollisionWorld(),beta:true,port:0});
  t.after(()=>running.close());await once(running.server,'listening');
  const base=`http://127.0.0.1:${running.server.address().port}`;
  const response=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({importId:randomUUID(),legacySave:localSave()})});
  assert.equal(response.status,403);assert.equal(Object.keys(running.world.state.characters).length,0);
});

test('explicit local beta import recovers a session after the first response is lost',async t=>{
  const running=startWorldServer({database:':memory:',collision:new CollisionWorld(),beta:true,allowLocalImport:true,port:0});
  t.after(()=>running.close());await once(running.server,'listening');
  const base=`http://127.0.0.1:${running.server.address().port}`;
  const body=JSON.stringify({importId:randomUUID(),legacySave:localSave()});
  const create=()=>fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body});
  const first=await create();assert.equal(first.status,201);await first.arrayBuffer();
  const retry=await create();assert.equal(retry.status,201);const session=await retry.json();
  const resumed=await fetch(base+'/api/world',{headers:{Authorization:`Bearer ${session.token}`}});
  assert.equal(resumed.status,200);const snapshot=await resumed.json();
  assert.equal(snapshot.character.id,session.snapshot.character.id);
  assert.equal(Object.keys(running.world.state.characters).length,1);
  assert.equal(snapshot.character.inventory.find(i=>i.id==='weapon_scroll').count,99);
});
