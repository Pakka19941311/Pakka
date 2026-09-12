import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SERVICES} from '../src/world/territory.ts';
import {ITEMS} from '../src/data/game-data.ts';
import {STARTER_QUESTS,STARTER_ITEMS} from '../src/data/starter-progression-v3.ts';
import {parseBetaSave} from '../src/server/beta-import.ts';
let serial=0;const uid=()=>`quest-test-${++serial}`;const item=(id)=>({uid:uid(),id,plus:0,count:1});
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'varendor-starter-')),file=join(directory,'world.sqlite');let store=new WorldStore(file),world;
 const collision=new CollisionWorld(),options={collision,now:1000,identifier:uid,random:()=>.99,xpRate:9};
 world=new WorldSimulation({...options,store});const id=world.createCharacter('Старт','knight').id;world.heartbeat(id);
 Object.assign(world.state.characters[id],SERVICES['npc:elder'],{inventory:[],equipment:{},level:10,xp:0,gold:1000});world.state.monsters=[];world.recalculate(world.state.characters[id]);
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 return {id,collision,get world(){return world;},get store(){return store;},get p(){return world.state.characters[id];},
  send(command,key=uid()){return world.command(id,key,command);},restart(){store.close();store=new WorldStore(file);world=new WorldSimulation({...options,store});world.heartbeat(id);world.state.monsters=[];},
 };
}
const command=(questId,action='claim')=>({type:'starterQuest',questId,action});
function markReady(f,id){assert.equal(f.send(command(id,'accept')).ok,true);const d=STARTER_QUESTS.find(q=>q.id===id),r=f.p.starterProgress.quests[id];Object.assign(r,{kills:d.killCount,killKeys:Array.from({length:d.killCount},(_,i)=>`real-${i}`),evidence:[...d.evidence],status:'ready'});}
test('server claim is fixed XP despite xpRate9, once-only across SQLite restart, and persistent pending survives full bag',t=>{
 const f=fixture(t);markReady(f,'QUEST-105');f.p.inventory=Array.from({length:42},()=>item('potion'));
 const before=f.p.xp,request=command('QUEST-105'),first=f.send(request,'starter-durable-claim');assert.equal(first.ok,true);assert.equal(first.outcome.xpAwarded,2500);assert.equal(f.p.xp,before+2500);
 const pending=f.p.starterProgress.quests['QUEST-105'].pendingItems.map(i=>i.uid);assert.equal(pending.length,2);f.restart();assert.deepEqual(f.send(request,'starter-durable-claim'),first);
 assert.equal(f.p.starterProgress.quests['QUEST-105'].pendingItems.length,2);f.p.inventory.splice(0,2);const receive=f.send(request);
 assert.deepEqual(receive.outcome.items.map(i=>i.uid),pending);assert.equal(receive.outcome.xpAwarded,0);assert.equal(f.p.starterProgress.quests['QUEST-105'].status,'claimed');
 assert.equal(f.send(request).outcome.items.length,0);
});
test('server rejects field, wrong city, occluded, dead and forged completion requests without granting rewards',t=>{
 const f=fixture(t);markReady(f,'QUEST-101');const ready=structuredClone(f.p);
 for(const change of [{x:100,z:100},{...SERVICES['npc:asterhold:elder']},{spaceId:'mine'},{dead:true},{yOffset:10}]){Object.assign(f.p,ready,change);const before=structuredClone(f.p);assert.equal(f.send(command('QUEST-101')).ok,false);assert.deepEqual(f.p,before);}
 Object.assign(f.p,ready,{x:SERVICES['npc:elder'].x+2});f.collision.addBox(SERVICES['npc:elder'].x+1,SERVICES['npc:elder'].z,.2,2);assert.equal(f.send(command('QUEST-101')).ok,false);
 assert.equal(f.send({...command('QUEST-101'),action:'complete',xp:999999,rewards:['warden_sword']}).ok,false);
});
test('failed SQLite write rolls back quest entitlement, XP, pending records and items together',t=>{
 const f=fixture(t);markReady(f,'QUEST-101');f.world.checkpoint();const before=structuredClone(f.p);
 f.store.db.exec("CREATE TRIGGER fail_starter BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'starter-disk-error'); END;");
 assert.throws(()=>f.send(command('QUEST-101'),'rollback-starter'),/starter-disk-error/);assert.deepEqual(f.p,before);assert.deepEqual(f.store.load().characters[f.id],before);
 f.store.db.exec('DROP TRIGGER fail_starter');assert.equal(f.send(command('QUEST-101'),'rollback-starter').ok,true);assert.equal(f.p.inventory.filter(i=>i.id==='starter_weapon_knight').length,1);
});
test('actual monster death credits the correct owner exactly once and a new generation can count again',t=>{
 const f=fixture(t);f.send(command('QUEST-101','accept'));f.world.spawnMonster('spider',{x:60,z:5},'one-spawn');const m=f.world.state.monsters[0];
 Object.assign(f.p,{x:58,z:5});f.world.damage(m,999,f.p,false);assert.equal(f.p.starterProgress.quests['QUEST-101'].kills,1);f.world.damage(m,999,f.p,false);assert.equal(f.p.starterProgress.quests['QUEST-101'].kills,1);
 Object.assign(m,{alive:true,hp:1,generation:m.generation+1});f.world.damage(m,999,f.p,false);assert.equal(f.p.starterProgress.quests['QUEST-101'].kills,2);
 assert.equal(f.p.starterProgress.quests['QUEST-101'].evidence.length,0);
});
test('harmless target selection and actual movement cancellation add evidence without changing combat or destination',t=>{
 const f=fixture(t);f.send(command('QUEST-103','accept'));const rat={uid:'actual-rat',id:'v3_field_rat',alive:true,generation:2,x:20,z:5,spaceId:'surface'};f.world.state.monsters=[rat];
 f.p.destination={x:25,z:5};const before={target:f.p.target,destination:{...f.p.destination},autoAttack:f.p.autoAttack};
 f.world.input(f.id,1,{type:'selectTarget',entityId:rat.uid});assert.deepEqual({target:f.p.target,destination:f.p.destination,autoAttack:f.p.autoAttack},before);
 f.world.input(f.id,2,{type:'cancel'});assert.deepEqual(f.p.starterProgress.quests['QUEST-103'].evidence,['target-confirmed','movement-cancelled']);
 const flags=[...f.p.starterProgress.quests['QUEST-103'].evidence];rat.x=100;assert.throws(()=>f.world.input(f.id,3,{type:'selectTarget',entityId:rat.uid}),/missing-target/);assert.deepEqual(f.p.starterProgress.quests['QUEST-103'].evidence,flags);
});
test('same canonical starter definitions are bought only at a smith, respect class and never suppress quest entitlement',t=>{
 const f=fixture(t);Object.assign(f.p,SERVICES['npc:smith']);const before=f.p.gold;
 assert.equal(f.send({type:'buy',itemId:'starter_weapon_knight'}).ok,true);assert.equal(f.p.gold,before-90);assert.equal(f.send({type:'buy',itemId:'starter_weapon_mage'}).reason,'class-restricted');
 Object.assign(f.p,SERVICES['npc:shop']);assert.equal(f.send({type:'buy',itemId:'starter_gloves'}).reason,'shop-unavailable');
 Object.assign(f.p,SERVICES['npc:elder']);markReady(f,'QUEST-101');assert.equal(f.send(command('QUEST-101')).ok,true);assert.equal(f.p.inventory.filter(i=>i.id==='starter_weapon_knight').length,2);
 for(const id of Object.keys(STARTER_ITEMS))assert.deepEqual(ITEMS[id],STARTER_ITEMS[id]);assert.equal(f.world.snapshot(f.id).starterQuests.length,5);
});
test('private import validates and preserves pending quest entitlements, rejecting duplicate IDs or illegal class rewards',()=>{
 const p={...{name:'Старый',classId:'knight',level:10,xp:2500,gold:100,x:18,z:5,hp:100,mp:30,inventory:[],equipment:{}},starterProgress:{version:1,quests:{'QUEST-105':{status:'reward-pending',kills:6,killKeys:['a','b','c','d','e','f'],evidence:['returned-to-city'],acceptedAt:1000,xpGranted:true,pendingItems:[item('starter_head'),item('starter_belt')]}}}};
 const raw={schema:2,player:p,quest:4,kills:90,bossKills:3,lootBuffer:[]},parsed=parseBetaSave(raw);assert.deepEqual(parsed.starterProgress,p.starterProgress);assert.equal(parsed.quest,4);
 const duplicate=structuredClone(raw);duplicate.player.inventory=[{...p.starterProgress.quests['QUEST-105'].pendingItems[0]}];assert.throws(()=>parseBetaSave(duplicate),/invalid-beta-save/);
 const wrong=structuredClone(raw);wrong.player.starterProgress.quests['QUEST-105'].pendingItems[0].id='starter_weapon_mage';assert.throws(()=>parseBetaSave(wrong),/invalid-beta-save/);
});
