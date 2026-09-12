import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_ITEMS,STARTER_CLASSES,STARTER_QUESTS,STARTER_OUTSKIRTS_CHECKPOINT,STARTER_BOAR_ROUTE,starterRewardIds} from '../src/data/starter-progression-v3.ts';
import {initializeStarterQuests,acceptStarterQuest,recordStarterQuestEvent,claimStarterQuest,starterQuestViews} from '../src/core/starter-quests-v3.ts';
import {integerItemStats} from '../src/core/item-progression.ts';
import {applyExperience} from '../src/core/gameplay-session.ts';
const context={npcId:'npc:elder',position:{x:18,z:5,spaceId:'surface'},now:1000,lineOfSight:()=>true};
const item=(uid,id)=>({uid,id,plus:0,count:1});
const hero=(classId='knight',level=10)=>({id:'hero',classId,level,xp:0,hp:100,mp:10,dead:false,x:18,z:5,spaceId:'surface',inventory:[],equipment:{},storage:[],lootBuffer:[],migrationReserve:[],quest:3,kills:125,bossKills:2});
let serial=0;
const uid=()=>`starter-reward-${++serial}`;
const event=(kind,fields={})=>({kind,locationId:'L02',...fields});
function kills(state,id){const quest=STARTER_QUESTS.find(q=>q.id===id);for(let i=0;i<quest.killCount;i++)state=recordStarterQuestEvent(state,event('kill',{speciesId:quest.speciesId,entityUid:`${id}-enemy-${i}`,generation:1}));return state;}
function extras(state,id){
 const events={
  'QUEST-101':[event('inspect',{checkpointId:STARTER_OUTSKIRTS_CHECKPOINT})],
  'QUEST-102':[event('service',{npcId:'npc:smith'})],
  'QUEST-103':[event('target',{speciesId:'v3_field_rat',entityUid:'real-rat',generation:1}),event('movementCancelled',{hadMovement:true})],
  'QUEST-104':['approach','flank','retreat'].map(checkpoint=>event('routeCheckpoint',{routeId:STARTER_BOAR_ROUTE,checkpoint})),
  'QUEST-105':[event('cityReturn',{cityId:'greenfall',safe:true})],
 };
 for(const e of events[id])state=recordStarterQuestEvent(state,e);return state;
}
const ready=(state,id)=>extras(kills(acceptStarterQuest(state,id,context),id),id);

test('fourteen canonical starter definitions keep exact class stats and a 260-gold complete set',()=>{
 assert.equal(Object.keys(STARTER_ITEMS).length,14);
 assert.deepEqual(STARTER_ITEMS.starter_weapon_knight.atk,[8,12]);assert.deepEqual(STARTER_ITEMS.starter_weapon_ranger.atk,[7,11]);assert.equal(STARTER_ITEMS.starter_weapon_ranger.accuracy,2);
 assert.deepEqual(STARTER_ITEMS.starter_weapon_assassin.atk,[6,10]);assert.equal(STARTER_ITEMS.starter_weapon_assassin.crit,1);
 for(const id of ['mage','necro'])assert.equal(STARTER_ITEMS[`starter_weapon_${id}`].matk,14);
 assert.deepEqual(STARTER_CLASSES.map(c=>STARTER_ITEMS[`starter_chest_${c}`].def),[8,6,5,2,3]);
 assert.deepEqual(STARTER_CLASSES.map(c=>STARTER_ITEMS[`starter_chest_${c}`].mdef??0),[0,0,0,8,7]);
 for(const c of STARTER_CLASSES){const ids=STARTER_QUESTS.flatMap(q=>starterRewardIds(q.id,c));assert.equal(new Set(ids).size,6);assert.equal(ids.reduce((n,id)=>n+STARTER_ITEMS[id].buyPrice,0),260);for(const id of ids){assert.ok(STARTER_ITEMS[id].classes.includes(c));assert.equal(STARTER_ITEMS[id].requiredLevel,1);assert.equal(STARTER_ITEMS[id].assassinForeign,false);}}
 assert.ok(Object.values(integerItemStats(STARTER_ITEMS.starter_gloves,0)).filter(Boolean).length===1);
});
test('quests unlock independently at 1/5/1/3/7 and both operations require live nearby Roen with LOS in the same space',()=>{
 assert.deepEqual(STARTER_QUESTS.map(q=>q.minLevel),[1,5,1,3,7]);
 let state=acceptStarterQuest(hero('mage',1),'QUEST-103',context);state=acceptStarterQuest(state,'QUEST-101',context);
 assert.deepEqual(Object.keys(state.starterProgress.quests),['QUEST-103','QUEST-101']);
 assert.throws(()=>acceptStarterQuest(state,'QUEST-102',context),/quest-level/);
 for(const [change,ctx] of [[{x:22},context],[{spaceId:'mine'},context],[{dead:true},context],[{hp:0},context],[{}, {...context,npcId:'npc:asterhold:elder'}],[{}, {...context,lineOfSight:()=>false}],[{x:NaN},context]]){
  const p={...hero(),...change};assert.throws(()=>acceptStarterQuest(p,'QUEST-101',ctx));assert.throws(()=>claimStarterQuest({...ready(hero(),'QUEST-101'),...change},'QUEST-101',ctx,uid));
 }
});
test('kill credits require an accepted quest, correct species/location and unique UID plus generation',()=>{
 let state=hero();const e=event('kill',{speciesId:'spider',entityUid:'one-monster',generation:4});
 assert.deepEqual(recordStarterQuestEvent(state,e),state);state=acceptStarterQuest(state,'QUEST-101',context);
 for(const wrong of [{...e,speciesId:'wolf'},{...e,locationId:'L01'}])state=recordStarterQuestEvent(state,wrong);
 assert.equal(state.starterProgress.quests['QUEST-101'].kills,0);
 state=recordStarterQuestEvent(state,e);state=recordStarterQuestEvent(state,e);assert.equal(state.starterProgress.quests['QUEST-101'].kills,1);
 state=recordStarterQuestEvent(state,{...e,generation:5});assert.equal(state.starterProgress.quests['QUEST-101'].kills,2);
 assert.throws(()=>recordStarterQuestEvent(state,{...e,generation:NaN}),/invalid-quest-kill/);
});
test('kills alone never satisfy additional objectives; return events need completed hunting and route checkpoints are ordered',()=>{
 for(const quest of STARTER_QUESTS){const p=kills(acceptStarterQuest(hero(),quest.id,context),quest.id);assert.equal(p.starterProgress.quests[quest.id].status,'active');assert.throws(()=>claimStarterQuest(p,quest.id,context,uid),/quest-not-ready/);assert.equal(extras(p,quest.id).starterProgress.quests[quest.id].status,'ready');}
 for(const id of ['QUEST-102','QUEST-105']){let p=extras(acceptStarterQuest(hero(),id,context),id);p=kills(p,id);assert.equal(p.starterProgress.quests[id].status,'active');}
 let p=kills(acceptStarterQuest(hero(),'QUEST-104',context),'QUEST-104');for(const checkpoint of ['retreat','flank','approach'])p=recordStarterQuestEvent(p,event('routeCheckpoint',{routeId:STARTER_BOAR_ROUTE,checkpoint}));
 assert.deepEqual(p.starterProgress.quests['QUEST-104'].evidence,['boar-approach']);
});
test('all five classes receive server-selected +0 items and fixed quest XP, including high-level turn-in',()=>{
 assert.deepEqual(STARTER_QUESTS.map(q=>q.xp),[120,1200,40,450,2500]);
 for(const c of STARTER_CLASSES)for(const level of [10,80])for(const quest of STARTER_QUESTS){
  const p=ready(hero(c,level),quest.id),before=structuredClone(p),r=claimStarterQuest(p,quest.id,context,uid),xp=applyExperience(level,0,quest.xp);
  assert.deepEqual(p,before);assert.equal(r.outcome.xpAwarded,quest.xp);assert.equal(r.state.level,xp.level);assert.equal(r.state.xp,xp.xp);
  assert.deepEqual(r.outcome.items.map(i=>i.id),starterRewardIds(quest.id,c));assert.ok(r.outcome.items.every(i=>i.plus===0&&i.count===1));
  const again=claimStarterQuest(r.state,quest.id,context,()=>{throw Error('repeat generated uid');});assert.equal(again.outcome.xpAwarded,0);assert.deepEqual(again.state,r.state);
 }
});
test('full bag keeps durable reward UIDs outside loot buffers; head and belt can be received separately after restart',()=>{
 let p=ready(hero(),'QUEST-105');p.inventory=Array.from({length:42},(_,i)=>item(`owned-${i}`,'potion'));
 const r=claimStarterQuest(p,'QUEST-105',context,uid);p=JSON.parse(JSON.stringify(r.state));
 assert.equal(r.outcome.xpAwarded,2500);assert.equal(p.inventory.length,42);assert.equal(p.starterProgress.quests['QUEST-105'].status,'reward-pending');assert.equal(p.lootBuffer.length,0);
 const ids=p.starterProgress.quests['QUEST-105'].pendingItems.map(i=>i.uid);assert.equal(ids.length,2);
 const still=claimStarterQuest(p,'QUEST-105',context,()=>{throw Error('pending rerolled');});assert.equal(still.outcome.xpAwarded,0);assert.deepEqual(still.state,p);
 p.inventory.pop();const first=claimStarterQuest(p,'QUEST-105',context,uid);assert.deepEqual(first.outcome.items.map(i=>i.uid),ids.slice(0,1));assert.equal(first.outcome.xpAwarded,0);
 p=JSON.parse(JSON.stringify(first.state));p.inventory.pop();const second=claimStarterQuest(p,'QUEST-105',context,uid);assert.equal(second.outcome.status,'claimed');assert.deepEqual(second.outcome.items.map(i=>i.uid),ids.slice(1));assert.equal(second.outcome.xpAwarded,0);
});
test('historical quests and purchases remain intact and never create or suppress new entitlements',()=>{
 const p=hero();p.historicalQuests={'Q-R01':{status:'claimed',receipt:'old-one'},'Q-M02':{progress:2}};p.inventory=[item('purchased','starter_weapon_knight')];
 let next=initializeStarterQuests(p);assert.deepEqual(next.historicalQuests,p.historicalQuests);assert.equal(next.quest,3);assert.equal(next.kills,125);assert.deepEqual(next.starterProgress.quests,{});
 assert.deepEqual(initializeStarterQuests(next),next);next=claimStarterQuest(ready(next,'QUEST-101'),'QUEST-101',context,uid).state;
 assert.equal(next.inventory.filter(i=>i.id==='starter_weapon_knight').length,2);assert.equal(next.inventory[0].uid,'purchased');assert.deepEqual(next.historicalQuests,p.historicalQuests);
 assert.throws(()=>initializeStarterQuests({...next,starterProgress:{version:2,quests:{}}}),/unsupported-starter-quests/);
});
test('invalid reward UID or duplicate ownership never changes progression, money or items',()=>{
 const p=ready(hero(),'QUEST-105');p.storage=Array(500).fill(null);p.storage[499]=item('already-owned','potion');const before=structuredClone(p);
 assert.throws(()=>claimStarterQuest(p,'QUEST-105',context,()=> 'already-owned'),/duplicate-reward-uid/);assert.deepEqual(p,before);
 assert.throws(()=>claimStarterQuest(p,'QUEST-105',context,()=> 'same-new-id'),/duplicate-reward-uid/);assert.deepEqual(p,before);
 const duplicate=structuredClone(p);duplicate.migrationReserve.push({...duplicate.storage[499]});assert.throws(()=>claimStarterQuest(duplicate,'QUEST-105',context,uid),/ambiguous-item/);
});
test('snapshot selector derives class rewards and exact objective completion without client-side rules',()=>{
 const p=hero('necro',1),views=starterQuestViews(p);assert.deepEqual(views.map(v=>v.status),['available','locked','available','locked','locked']);
 assert.deepEqual(views[0].rewards,['starter_weapon_necro']);assert.equal(views[0].xp,120);
 const v=starterQuestViews(ready(hero(),'QUEST-103')).find(v=>v.id==='QUEST-103');assert.equal(v.status,'ready');assert.equal(v.kills,4);assert.ok(v.objectives.every(o=>o.complete));
});
