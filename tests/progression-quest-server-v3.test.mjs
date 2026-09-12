import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {FinalWorld} from '../src/world/final-world.ts';
import {PROGRESSION_QUESTS} from '../src/data/progression-quests-v3.ts';
import {initializeProgressionQuests,recordProgressionQuestEvent} from '../src/core/progression-quests-v3.ts';
import {ProgressionQuestObserver,bindProgressionQuestWorld} from '../src/server/progression-quest-world.ts';
import {parseBetaSave} from '../src/server/beta-import.ts';
let serial=0;const uid=()=>`late-quest-${++serial}`,item=(id)=>({uid:uid(),id,plus:0,count:1});
const geography=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'varendor-late-quest-')),file=join(directory,'world.sqlite');let store=new WorldStore(file),world;
 const finalWorld=Object.create(geography);finalWorld.slots=[...geography.slots];finalWorld.slotById=new Map(geography.slotById);
 const options={finalWorld,collision:geography.spaces.surface.collision,now:1000,identifier:uid,random:()=>.99,xpRate:9,beta:true};
 world=new WorldSimulation({...options,store});const id=world.createCharacter('Поручения','knight').id;world.heartbeat(id);
 Object.assign(world.state.characters[id],geography.services['npc:elder'],{inventory:[],equipment:{},level:60,xp:0,gold:1000});world.state.monsters=[];world.recalculate(world.state.characters[id]);
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 return {id,finalWorld,get world(){return world;},get store(){return store;},get p(){return world.state.characters[id];},send(c,key=uid()){return world.command(id,key,c);},
  restart(){store.close();store=new WorldStore(file);world=new WorldSimulation({...options,store});world.heartbeat(id);world.state.monsters=[];},at(npc){Object.assign(world.state.characters[id],geography.services[npc],{yOffset:0,dead:false});}};
}
const command=(questId,action='claim',extra={})=>({type:'progressionQuest',questId,action,...extra});
function markReady(f,id){
 assert.equal(f.send(command(id,'accept')).ok,true);for(const marker of PROGRESSION_QUESTS.find(q=>q.id===id).markers){
  const point=f.world.progressionWorld.bindings.markers[marker.id];Object.assign(f.p,{spaceId:marker.spaceId});Object.assign(f.p,recordProgressionQuestEvent(f.p,{kind:'marker',...point},f.world.progressionWorld.bindings));
 }f.at('npc:elder');
}
test('actual authored roads and rooms bind 14 markers while missing canonical hunting slots remain closed',()=>{
 const runtime=bindProgressionQuestWorld(geography);assert.equal(runtime.markers.length,14);assert.equal(runtime.bindings.huntKeys.length,0);
 for(const marker of runtime.markers)for(const point of marker.points)assert.equal(geography.space(point).collision.isBlocked(point,.46),false);
 assert.equal(runtime.markers.find(m=>m.id==='q141:cave-route').points.length,3);
 const changed=Object.create(geography);changed.layout=structuredClone(geography.layout);changed.layout.roads=changed.layout.roads.filter(r=>r.id!=='living-forest-loop');
 assert.equal(bindProgressionQuestWorld(changed).bindings.markers['q110:outlook-a'],undefined);
});
test('server requires actual giver, LOS, matching space and life; extra claimed XP/rewards cannot bypass the ledger',t=>{
 const f=fixture(t);assert.equal(f.send(command('QUEST-115','accept')).reason,'quest-world-not-ready');markReady(f,'QUEST-110');const before=structuredClone(f.p);
 for(const change of [{x:0,z:0},{spaceId:'mine'},{yOffset:20},{dead:true},{...geography.services['npc:books']}]){Object.assign(f.p,before,change);const unchanged=structuredClone(f.p);assert.equal(f.send(command('QUEST-110')).ok,false);assert.deepEqual(f.p,unchanged);}
 Object.assign(f.p,before);const blocked=f.world.lineOfSight;f.world.lineOfSight=()=>false;assert.equal(f.send(command('QUEST-110')).reason,'quest-giver-unavailable');f.world.lineOfSight=blocked;
 assert.equal(f.send(command('QUEST-110','complete',{xp:999999,rewards:['warden_sword']})).reason,'invalid-quest-action');
 assert.equal(f.send(command('QUEST-110')).outcome.xpAwarded,4030);assert.equal(f.p.inventory[0].id,'potion');assert.equal(f.p.inventory[0].count,3);
});
test('fixed reward, capped stacks and pending material UIDs survive SQLite restart and double submit',t=>{
 const f=fixture(t);markReady(f,'QUEST-120');f.p.inventory=Array.from({length:42},()=>item('potion'));const stack=item('mat_01');stack.count=998;f.p.inventory[0]=stack;
 const request=command('QUEST-120'),receipt=f.send(request,'late-durable');assert.equal(receipt.outcome.xpAwarded,20544);assert.equal(f.p.inventory[0].count,999);
 const pending=f.p.progressionQuests.quests['QUEST-120'].pendingItems;assert.deepEqual(pending.map(i=>[i.id,i.count]),[['mat_01',2],['mat_07',2]]);f.restart();assert.deepEqual(f.send(request,'late-durable'),receipt);
 assert.throws(()=>f.send({...request,rewardChoice:'weapon_scroll'},'late-durable'),/command-id-conflict/);
 f.p.inventory.splice(-2);const recovered=f.send(request);assert.deepEqual(recovered.outcome.delivered.map(i=>i.inventoryUid),pending.map(i=>i.uid));assert.equal(recovered.outcome.xpAwarded,0);assert.equal(f.send(request).outcome.delivered.length,0);
});
test('failed durable write rolls back XP, selected reward, pending records and receipt together',t=>{
 const f=fixture(t);markReady(f,'QUEST-125');f.world.checkpoint();const before=structuredClone(f.p);
 f.store.db.exec("CREATE TRIGGER fail_late BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'late-disk-error'); END;");
 assert.throws(()=>f.send(command('QUEST-125','claim',{rewardChoice:'armor_scroll'}),'late-fail'),/late-disk-error/);assert.deepEqual(f.p,before);assert.deepEqual(f.store.load().characters[f.id],before);
 f.store.db.exec('DROP TRIGGER fail_late');assert.equal(f.send(command('QUEST-125')).reason,'quest-reward-choice-required');
 assert.equal(f.send(command('QUEST-125','claim',{rewardChoice:'armor_scroll'}),'late-fail').ok,true);assert.deepEqual(f.p.inventory.map(i=>i.id),['armor_scroll']);
});
test('restart migrates old ready/claimed books, preserves existing buffered UID, and both command paths consume one entitlement',t=>{
 const f=fixture(t);delete f.p.progressionQuests;f.p.bookQuests={book_knight_50:'claimed',book_knight_60:'ready'};
 const old=item('book_knight_50');f.p.lootBuffer=[old];f.p.quest=4;f.world.checkpoint();f.restart();f.at('npc:books');
 assert.equal(f.p.quest,4);assert.equal(f.p.progressionQuests.quests['QUEST-150'].pendingItems[0].uid,old.uid);assert.equal(f.p.lootBuffer.length,0);
 const recover=f.send(command('QUEST-150'));assert.equal(recover.outcome.xpAwarded,0);assert.equal(f.p.inventory[0].uid,old.uid);
 const book=f.send(command('QUEST-160'));assert.equal(book.outcome.xpAwarded,339498);assert.equal(f.p.inventory.filter(i=>i.id==='book_knight_60').length,1);
 f.at('npc:asterhold:elder');assert.equal(f.send({type:'bookQuest',level:60}).outcome.xpAwarded,0);assert.equal(f.p.inventory.filter(i=>i.id==='book_knight_60').length,1);
 const views=f.world.snapshot(f.id).progressionQuests;assert.equal(views.find(q=>q.id==='QUEST-150').status,'claimed');assert.equal(views.find(q=>q.id==='QUEST-160').status,'claimed');assert.equal(views.filter(q=>q.id==='QUEST-150'||q.id==='QUEST-160').some(q=>q.status==='available'),false);assert.ok(views.find(q=>q.id==='QUEST-160').objectives.every(o=>o.id==='legacy-completed'&&o.complete));
});
test('ordinary trial death uses runtime slot metadata, credits actual owner once, and old bosses do not ready it',t=>{
 const f=fixture(t);f.p.bookQuests={book_knight_60:'active'};Object.assign(f.p,initializeProgressionQuests(f.p));f.world.progressionWorld.bindings.huntKeys.push('QUEST-160:knight');
 const slot={uid:'trial-ice',speciesId:'ice_golem',level:60,locationId:'L04',subzoneId:'L04-B',groupId:'trial',boss:false,patrol:[],aggroRadius:9,leashRadius:24,x:-100,z:-190,spaceId:'surface'};
 f.finalWorld.slotById.set(slot.uid,slot);f.world.spawnMonster(slot.speciesId,slot,slot.uid,slot.groupId);const monster=f.world.state.monsters[0];monster.level=60;
 f.world.damage(monster,1e6,f.p,false);assert.equal(f.p.progressionQuests.quests['QUEST-160'].kills,1);f.world.damage(monster,1e6,f.p,false);assert.equal(f.p.progressionQuests.quests['QUEST-160'].kills,1);
 Object.assign(monster,{alive:true,hp:1,generation:monster.generation+1});f.world.damage(monster,1e6,f.p,false);assert.equal(f.p.progressionQuests.quests['QUEST-160'].kills,2);
 const before=f.p.progressionQuests.quests['QUEST-160'].kills;monster.id='rift_boss';Object.assign(monster,{alive:true,hp:1,generation:monster.generation+1});f.world.damage(monster,1e6,f.p,false);assert.equal(f.p.progressionQuests.quests['QUEST-160'].kills,before);assert.equal(f.p.bookQuests.book_knight_60,'active');
});
test('marker observer requires real entry, continuous movement, LOS and dwell; generation resets cannot teleport credit',t=>{
 const f=fixture(t);assert.equal(f.send(command('QUEST-110','accept')).ok,true);const observer=new ProgressionQuestObserver(),marker=f.world.progressionWorld.markers[0],point=marker.points[0];let now=1000;
 const observe=(x,visible=true,generation=f.p.generation)=>{Object.assign(f.p,point,{x,generation,activeUntil:1e9,grounded:true});f.p.stats.speed=10;Object.assign(f.p,observer.observe(f.p,now+=250,f.world.progressionWorld,()=>visible));};
 for(let i=0;i<8;i++)observe(point.x);assert.deepEqual(f.p.progressionQuests.quests['QUEST-110'].evidence,[]);
 observe(point.x+5);observe(point.x+3);for(let i=0;i<5;i++)observe(point.x+3,false);assert.deepEqual(f.p.progressionQuests.quests['QUEST-110'].evidence,[]);
 observe(point.x+5);observe(point.x+3);for(let i=0;i<5;i++)observe(point.x+3);assert.deepEqual(f.p.progressionQuests.quests['QUEST-110'].evidence,['q110:outlook-a']);
 const next=f.world.progressionWorld.markers[1].points[0];for(let i=0;i<7;i++){Object.assign(f.p,next,{generation:99});Object.assign(f.p,observer.observe(f.p,now+=250,f.world.progressionWorld,()=>true));}
 assert.deepEqual(f.p.progressionQuests.quests['QUEST-110'].evidence,['q110:outlook-a']);assert.equal(f.p.progressionQuests.quests['QUEST-110'].status,'active');
});
test('actual return near Roen readies the cave route and the snapshot supplies concrete next marker hints',t=>{
 const f=fixture(t);markReady(f,'QUEST-141');assert.equal(f.p.progressionQuests.quests['QUEST-141'].status,'active');f.world.advance(1500);assert.equal(f.p.progressionQuests.quests['QUEST-141'].status,'ready');
 assert.equal(f.send(command('QUEST-141')).outcome.xpAwarded,87284);const view=f.world.snapshot(f.id).progressionQuests.find(q=>q.id==='QUEST-110');assert.ok(view.objectives[0].target);assert.equal(view.requirementsAvailable,true);
});
test('private import preserves book states and pending rewards, remaps each owned UID once, rejects duplicate pending or illegal rewards',t=>{
 const f=fixture(t);f.p.bookQuests={book_knight_60:'ready'};Object.assign(f.p,initializeProgressionQuests(f.p));f.at('npc:books');f.p.inventory=Array.from({length:42},()=>item('potion'));assert.equal(f.send(command('QUEST-160')).outcome.status,'reward-pending');
 const raw={schema:2,player:{...structuredClone(f.p),x:18,z:5},quest:4,kills:123,bossKills:5,lootBuffer:[]};const parsed=parseBetaSave(raw);assert.equal(parsed.bookQuests.book_knight_60,'claimed');assert.equal(parsed.progressionQuests.quests['QUEST-160'].pendingItems.length,1);
 const imported=f.world.importCharacter('late-import-unique-0001',raw);assert.equal(imported.progressionQuests.quests['QUEST-160'].status,'reward-pending');assert.notEqual(imported.progressionQuests.quests['QUEST-160'].pendingItems[0].uid,parsed.progressionQuests.quests['QUEST-160'].pendingItems[0].uid);
 const duplicate=structuredClone(raw);duplicate.player.inventory[0]={...duplicate.player.progressionQuests.quests['QUEST-160'].pendingItems[0]};assert.throws(()=>parseBetaSave(duplicate),/invalid-beta-save/);
 const wrong=structuredClone(raw);wrong.player.progressionQuests.quests['QUEST-160'].pendingItems[0].id='starter_weapon_knight';assert.throws(()=>parseBetaSave(wrong),/invalid-beta-save/);
 const legacy={...raw,player:{...raw.player,progressionQuests:undefined,bookQuests:{book_knight_50:'ready',book_knight_60:'active'}}};assert.deepEqual(parseBetaSave(legacy).bookQuests,legacy.player.bookQuests);
});
test('books 50/60 never become zero-price shop items after quest integration',t=>{
 const f=fixture(t);f.at('npc:books');const before=structuredClone(f.p);
 for(const level of [50,60])assert.equal(f.send({type:'buy',itemId:`book_knight_${level}`}).ok,false);
 assert.deepEqual(f.p,before);assert.equal(f.send({type:'buy',itemId:'book_knight_10'}).reason,'insufficient-gold');
});
