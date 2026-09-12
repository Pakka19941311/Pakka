import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProgressionV3} from '../src/core/progression-migration-v3.ts';
import {xpNeeded} from '../src/core/game-rules.ts';

test('level 100 save keeps its original progression record and every item when capped at 90',()=>{
 const old={level:100,xp:90000000,hp:441,mp:31,gold:987,inventory:[{uid:'unique-ring'}],equipment:{ear2:{uid:'old-ear'}}};
 const next=normalizeProgressionV3(old);
 assert.equal(old.level,100);assert.equal(next.level,90);assert.equal(next.xp,xpNeeded(90)-1);
 assert.deepEqual(next.legacyProgression,{version:3,originalLevel:100,originalXp:90000000,reason:'level-cap-90'});
 for(const key of ['hp','mp','gold','inventory','equipment'])assert.deepEqual(next[key],old[key]);
 assert.deepEqual(normalizeProgressionV3(JSON.parse(JSON.stringify(next))),next);
});

test('legal low-level and dead profiles are not refilled or modified; invalid save data is rejected',()=>{
 const old={level:15,xp:235,hp:0,dead:true};assert.equal(normalizeProgressionV3(old),old);
 assert.equal(normalizeProgressionV3({level:91,xp:0,hp:0}).hp,0);
 assert.equal(normalizeProgressionV3({level:90,xp:0}).xp,0);
 for(const level of [0,-1,NaN,Infinity,12.5])assert.throws(()=>normalizeProgressionV3({level,xp:0}),/invalid-saved-progression/);
 for(const xp of [-1,NaN,Infinity,12.5])assert.throws(()=>normalizeProgressionV3({level:1,xp}),/invalid-saved-progression/);
});

import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {WorldStore} from '../server/world-store.mjs';
import {CLASSES} from '../src/data/game-data.ts';
import {calculateEquipmentStats} from '../src/core/equipment-stats.ts';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';

function savedWorld(t){
 const directory=mkdtempSync(join(tmpdir(),'varendor-level-cap-')),file=join(directory,'world.sqlite');let store=new WorldStore(file);
 const options=()=>({store,now:1000,collision:new CollisionWorld(),identifier:randomUUID,beta:true});
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 return {get store(){return store;},create(){return new WorldSimulation(options());},restart(){store.close();store=new WorldStore(file);return new WorldSimulation(options());}};
}
test('real SQLite world load caps five classes once, restores cap-derived stats and preserves dead/live health and possessions',t=>{
 const f=savedWorld(t),world=f.create(),ids=[];
 for(const classId of Object.keys(CLASSES)){
  const p=world.createCharacter(classId,classId);ids.push(p.id);
  Object.assign(p,{level:100,xp:90000000,gold:4321,hp:17,mp:9,equipment:{},inventory:[{uid:randomUUID(),id:'potion',plus:0,count:11}],dead:classId==='necro'});
  if(p.dead)p.hp=0;
 }
 f.store.save(world.state);const before=structuredClone(world.state.characters),loaded=f.restart();
 for(const id of ids){
  const p=loaded.state.characters[id],old=before[id];
  assert.equal(p.level,90);assert.equal(p.xp,xpNeeded(90)-1);assert.equal(p.legacyProgression.originalLevel,100);
  assert.equal(p.gold,old.gold);assert.equal(p.hp,old.hp);assert.equal(p.mp,old.mp);assert.deepEqual(p.inventory,old.inventory);
  const stats=calculateEquipmentStats(p.classId,CLASSES[p.classId].stats,90,{},()=>undefined);
  assert.equal(p.maxHp,stats.maxHp);for(const key of ['str','dex','int','physicalAccuracy','magicAccuracy'])assert.equal(p.stats[key],stats.stats[key],p.classId+key);
 }
 const again=f.restart();for(const id of ids){assert.deepEqual(again.state.characters[id].legacyProgression,loaded.state.characters[id].legacyProgression);assert.equal(again.state.characters[id].hp,before[id].hp);}
});
test('private legacy import retains the level100 original in the same transaction and retry never recaps or heals',t=>{
 const f=savedWorld(t),world=f.create();
 const raw={schema:2,betaScrollGrant:'beta-scrolls-100-v1',player:{name:'Старый герой',classId:'mage',level:100,xp:90000000,gold:77,x:0,z:0,hp:11,mp:2,inventory:[],equipment:{}},lootBuffer:[]};
 const source=structuredClone(raw),importId=randomUUID(),p=world.importCharacter(importId,raw);
 assert.deepEqual(raw,source);assert.equal(p.level,90);assert.equal(p.hp,11);assert.equal(p.mp,2);assert.equal(p.gold,77);assert.equal(p.legacyProgression.originalLevel,100);
 const backup=JSON.parse(f.store.db.prepare('SELECT original FROM imports WHERE character=?').get(p.id).original);assert.deepEqual(backup,source);
 const again=f.restart().importCharacter(importId,raw);assert.equal(again.id,p.id);assert.deepEqual(again.legacyProgression,p.legacyProgression);assert.equal(again.hp,11);
});
