import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {ITEMS} from '../src/data/game-data.ts';
import {SKILL_BOOKS} from '../src/data/skill-books.ts';
import {STARTER_CLASSES} from '../src/data/starter-progression-v3.ts';
import {PROGRESSION_QUESTS,progressionQuestDefinition,progressionQuestHunt,progressionRewardStacks,progressionBookId} from '../src/data/progression-quests-v3.ts';
import {initializeProgressionQuests,acceptProgressionQuest,recordProgressionQuestEvent,claimProgressionQuest,progressionQuestViews,progressionHuntKey,EMPTY_PROGRESSION_BINDINGS} from '../src/core/progression-quests-v3.ts';
let serial=0;const uid=()=>`progression-${++serial}`;const item=(id,count=1)=>({uid:uid(),id,plus:0,count});
const hero=(classId='knight',level=60)=>({id:'hero',classId,level,xp:0,hp:100,mp:33,dead:false,x:0,z:0,spaceId:'surface',inventory:[],equipment:{},storage:[],lootBuffer:[],migrationReserve:[],quest:4,kills:800,bossKills:12});
const context=(questId,extra={})=>({npcId:progressionQuestDefinition(questId).giverId,position:{x:0,z:0,spaceId:'surface'},now:1000,lineOfSight:()=>true,...extra});
const policy=id=>ITEMS[id];
const bindings={revision:'synthetic-test-world',markers:Object.fromEntries(PROGRESSION_QUESTS.flatMap(q=>q.markers.map(m=>[m.id,{runtimeId:'verified:'+m.id,locationId:m.locationId,spaceId:m.spaceId}]))),huntKeys:PROGRESSION_QUESTS.flatMap(q=>STARTER_CLASSES.filter(c=>progressionQuestHunt(q.id,c)).map(c=>progressionHuntKey(q.id,c)))};
function kill(state,questId,fields={}){const h=progressionQuestHunt(questId,state.classId);return recordProgressionQuestEvent(state,{kind:'kill',creditedHeroId:state.id,entityUid:uid(),generation:1,speciesId:h.speciesId,level:h.levelMin,subzoneId:h.subzoneId,locationId:h.locationId,spaceId:h.spaceId,...fields},bindings);}
function visit(state,marker){return recordProgressionQuestEvent({...state,spaceId:marker.spaceId},{kind:'marker',runtimeId:bindings.markers[marker.id].runtimeId,spaceId:marker.spaceId,locationId:marker.locationId},bindings);}
function ready(state,questId){
 if(questId==='QUEST-160')state={...state,bookQuests:{...state.bookQuests,[progressionBookId(state.classId,50)]:'claimed'}};
 let p=acceptProgressionQuest(state,questId,context(questId),bindings);const q=progressionQuestDefinition(questId),h=progressionQuestHunt(questId,state.classId);
 if(h)for(let i=0;i<h.count;i++)p=kill(p,questId);
 for(const marker of q.markers)p=visit(p,marker);
 p={...p,spaceId:'surface'};if(q.returnToGiver)p=recordProgressionQuestEvent(p,{kind:'service',npcId:q.giverId},bindings);return p;
}
const claim=(p,id,choice,fn=uid)=>claimProgressionQuest(p,{questId:id,...(choice?{rewardChoice:choice}:{})},context(id),fn,policy);

test('ten fixed XP rewards match the accepted constant quest-level formula, never the hero level',()=>{
 assert.equal(PROGRESSION_QUESTS.length,10);assert.deepEqual(PROGRESSION_QUESTS.map(q=>q.xp),[4030,13062,20544,43385,44394,44394,87284,87284,221188,339498]);
 for(const q of PROGRESSION_QUESTS)assert.equal(q.xp,Math.round(Math.floor(150*Math.pow(q.level,2.35))*q.fraction));
 for(const level of [10,80]){const p=ready(hero('knight',level),'QUEST-110'),r=claim({...p,xpRate:999},'QUEST-110');assert.equal(r.outcome.xpAwarded,4030);}
 assert.throws(()=>progressionQuestDefinition('QUEST-190'),/unknown-progression-quest/);
});
test('rewards are only exact consumables, materials, one chosen scroll or actual class books; no new ability or gear',()=>{
 assert.deepEqual(progressionRewardStacks('QUEST-120','mage'),[{id:'mat_01',count:3},{id:'mat_07',count:2}]);
 for(const q of PROGRESSION_QUESTS)for(const c of STARTER_CLASSES){
  const rewards=q.rewardChoices?q.rewardChoices:progressionRewardStacks(q.id,c);
  for(const r of rewards){assert.ok(ITEMS[r.id]);assert.equal(ITEMS[r.id].slot,undefined);}
  if(q.bookLevel){const id=progressionBookId(c,q.bookLevel);assert.equal(SKILL_BOOKS[id].classId,c);assert.equal(SKILL_BOOKS[id].level,q.bookLevel);assert.deepEqual(rewards,[{id,count:1}]);}
 }
 assert.deepEqual(['QUEST-130','QUEST-131','QUEST-140','QUEST-141'].map(id=>progressionRewardStacks(id,'knight')),[[],[],[],[]]);
});
test('unbound or aliased world points cannot open exploration; numeric old quest is never guessed into new credit',()=>{
 const p=hero();assert.throws(()=>acceptProgressionQuest(p,'QUEST-110',context('QUEST-110')),/quest-world-not-ready/);
 const invalid=structuredClone(bindings);invalid.markers['q110:outlook-b'].runtimeId=invalid.markers['q110:outlook-a'].runtimeId;
 assert.throws(()=>acceptProgressionQuest(p,'QUEST-110',context('QUEST-110'),invalid),/quest-world-not-ready/);
 const initialized=initializeProgressionQuests({...p,historicalQuests:{'Q-R01':'claimed','Q-I03':'active'}});assert.deepEqual(initialized.progressionQuests.quests,{});assert.equal(initialized.quest,4);assert.equal(initialized.historicalQuests['Q-I03'],'active');
});
test('different marker proofs count once, wrong spaces or locations do not count, and cave route needs a later return',()=>{
 let p=acceptProgressionQuest(hero(),'QUEST-110',context('QUEST-110'),bindings);const [a,b]=progressionQuestDefinition('QUEST-110').markers;
 p=visit(visit(p,a),a);assert.deepEqual(p.progressionQuests.quests['QUEST-110'].evidence,[a.id]);assert.throws(()=>claim(p,'QUEST-110'),/quest-not-ready/);
 const bad=recordProgressionQuestEvent(p,{kind:'marker',runtimeId:bindings.markers[b.id].runtimeId,locationId:'L07',spaceId:'great_cave'},bindings);assert.deepEqual(bad.progressionQuests.quests['QUEST-110'].evidence,[a.id]);
 p=visit(p,b);assert.equal(p.progressionQuests.quests['QUEST-110'].status,'ready');
 p=acceptProgressionQuest(hero(),'QUEST-141',context('QUEST-141'),bindings);p=recordProgressionQuestEvent(p,{kind:'service',npcId:'npc:elder'},bindings);p=visit(p,progressionQuestDefinition('QUEST-141').markers[0]);assert.equal(p.progressionQuests.quests['QUEST-141'].status,'active');
 p=recordProgressionQuestEvent({...p,spaceId:'surface'},{kind:'service',npcId:'npc:elder'},bindings);assert.equal(p.progressionQuests.quests['QUEST-141'].status,'ready');
});
test('hunting credit checks owner, species, exact area, level and space, then deduplicates UID plus generation',()=>{
 let p=acceptProgressionQuest(hero(),'QUEST-115',context('QUEST-115'),bindings);
 for(const wrong of [{creditedHeroId:'other'},{speciesId:'spider'},{subzoneId:'L03-B'},{level:9},{level:15},{locationId:'L02'},{spaceId:'mine'}])p=kill(p,'QUEST-115',wrong);
 assert.equal(p.progressionQuests.quests['QUEST-115'].kills,0);
 p=kill(p,'QUEST-115',{entityUid:'same',generation:3});p=kill(p,'QUEST-115',{entityUid:'same',generation:3});assert.equal(p.progressionQuests.quests['QUEST-115'].kills,1);
 p=kill(p,'QUEST-115',{entityUid:'same',generation:4});assert.equal(p.progressionQuests.quests['QUEST-115'].kills,2);
});
test('all ten class trials use the accepted ordinary species/areas/levels and never the old big/rift boss route',()=>{
 const expected50={knight:['MOB-29','L10-C',48,50,8],mage:['MOB-28','L08-A',48,50,8],ranger:['MOB-30','L08-A',50,50,8],assassin:['MOB-30','L08-A',50,50,8],necro:['MOB-29','L10-C',48,50,8]};
 const expected60={knight:['MOB-35','L04-B',60,60,6],mage:['MOB-37','L08-B',60,60,8],ranger:['MOB-34','L04-B',58,60,8],assassin:['MOB-37','L08-B',60,60,8],necro:['MOB-36','L04-C',60,60,8]};
 for(const c of STARTER_CLASSES)for(const [id,expected] of [['QUEST-150',expected50],['QUEST-160',expected60]]){
  const h=progressionQuestHunt(id,c);assert.deepEqual([h.mobId,h.subzoneId,h.levelMin,h.levelMax,h.count],expected[c]);
  let p=hero(c);if(id==='QUEST-160')p.bookQuests={[progressionBookId(c,50)]:'claimed'};p=acceptProgressionQuest(p,id,context(id),bindings);
  p=kill(p,id,{speciesId:'big'});p=kill(p,id,{speciesId:'rift_boss',level:80});assert.equal(p.progressionQuests.quests[id].kills,0);
  for(let i=0;i<h.count;i++)p=kill(p,id);assert.equal(p.progressionQuests.quests[id].status,'ready');
  const result=claim(p,id);assert.equal(result.outcome.delivered[0].id,progressionBookId(c,id==='QUEST-150'?50:60));
 }
});
test('new trial60 requires surrender of trial50; level, the actual NPC, LOS, height and space remain authoritative',()=>{
 assert.throws(()=>acceptProgressionQuest(hero('mage',49),'QUEST-150',context('QUEST-150'),bindings),/quest-level/);
 assert.throws(()=>acceptProgressionQuest(hero('mage'),'QUEST-160',context('QUEST-160'),bindings),/quest-prerequisite/);
 let p=ready(hero('mage'),'QUEST-150');assert.throws(()=>acceptProgressionQuest(p,'QUEST-160',context('QUEST-160'),bindings),/quest-prerequisite/);
 p=claim(p,'QUEST-150').state;assert.equal(acceptProgressionQuest(p,'QUEST-160',context('QUEST-160'),bindings).progressionQuests.quests['QUEST-160'].status,'active');
 for(const extra of [{npcId:'npc:asterhold:elder'},{lineOfSight:()=>false},{heightDifference:4},{position:{x:4,z:0}},{position:{x:0,z:0,spaceId:'mine'}}])assert.throws(()=>acceptProgressionQuest(hero(),'QUEST-150',context('QUEST-150',extra),bindings),/quest-giver-unavailable/);
});
test('legacy active/ready/claimed map explicitly for each real book and initialization is repeatable without XP or item changes',()=>{
 for(const c of STARTER_CLASSES)for(const level of [50,60])for(const status of ['active','ready','claimed']){
  const bookId=progressionBookId(c,level),id=level===50?'QUEST-150':'QUEST-160',p={...hero(c),bookQuests:{[bookId]:status,unknown_old_key:'active'}},before=structuredClone(p),next=initializeProgressionQuests(p);
  assert.deepEqual(p,before);assert.equal(next.progressionQuests.quests[id].status,status);assert.equal(next.xp,0);assert.equal(next.inventory.length,0);assert.equal(next.bookQuests.unknown_old_key,'active');assert.deepEqual(initializeProgressionQuests(next),next);
  if(level===60&&status!=='claimed')assert.equal(next.progressionQuests.quests[id].prerequisiteExempt,true);
 }
});
test('legacy ready60 keeps entitlement without trial50 or replacement kills; already claimed books receive no retroactive XP or second item',()=>{
 const p=initializeProgressionQuests({...hero('necro'),bookQuests:{book_necro_60:'ready'}}),r=claim(p,'QUEST-160');assert.equal(r.outcome.xpAwarded,339498);assert.equal(r.outcome.delivered[0].id,'book_necro_60');
 const old={...hero('necro'),bookQuests:{book_necro_50:'claimed'},inventory:[item('book_necro_50')]},result=claim(old,'QUEST-150',undefined,()=>{throw Error('minted twice');});assert.equal(result.outcome.xpAwarded,0);assert.equal(result.state.inventory.length,1);
 const absent=claim({...old,inventory:[]},'QUEST-150',undefined,()=>{throw Error('restored consumed book');});assert.equal(absent.state.inventory.length,0);
});
test('an old claimed book in lootBuffer becomes persistent recovery with the same UID and no new XP or new book',()=>{
 const book=item('book_knight_50'),p={...hero(),bookQuests:{book_knight_50:'claimed'},lootBuffer:[item('potion'),book],inventory:Array.from({length:42},()=>item('potion'))};
 let next=initializeProgressionQuests(p);assert.equal(next.lootBuffer.length,1);assert.deepEqual(next.progressionQuests.quests['QUEST-150'].pendingItems,[book]);assert.equal(next.progressionQuests.quests['QUEST-150'].status,'reward-pending');
 next=JSON.parse(JSON.stringify(next));next.inventory.pop();const r=claim(next,'QUEST-150',undefined,()=>{throw Error('legacy minted');});assert.equal(r.outcome.xpAwarded,0);assert.equal(r.outcome.delivered[0].inventoryUid,book.uid);assert.deepEqual(r.state.progressionQuests.legacy.bookRewardBuffer,[book]);assert.equal(claim(r.state,'QUEST-150').outcome.delivered.length,0);
});
test('owned or already learned book without a consumed entitlement does not suppress the agreed reward',()=>{
 let p={...hero('mage'),inventory:[item('book_mage_50')],learnedSkills:['book_mage_50']};p=ready(p,'QUEST-150');const r=claim(p,'QUEST-150');assert.equal(r.state.inventory.filter(i=>i.id==='book_mage_50').length,2);assert.deepEqual(r.state.learnedSkills,p.learnedSkills);assert.equal(claim(r.state,'QUEST-150').outcome.delivered.length,0);
});
test('full bags can merge consumable rewards; capped material remainders remain pending with original UIDs',()=>{
 let p=ready(hero(),'QUEST-110');p.inventory=[item('potion',5),...Array.from({length:41},()=>item('ether'))];let r=claim(p,'QUEST-110');assert.equal(r.state.inventory[0].count,8);assert.equal(r.outcome.status,'claimed');assert.equal(r.state.inventory.length,42);
 p=ready(hero(),'QUEST-120');p.inventory=[item('mat_01',997),...Array.from({length:41},()=>item('ether'))];r=claim(p,'QUEST-120');assert.equal(r.state.inventory[0].count,999);assert.deepEqual(r.state.progressionQuests.quests['QUEST-120'].pendingItems.map(i=>[i.id,i.count]),[['mat_01',1],['mat_07',2]]);
 const pending=r.state.progressionQuests.quests['QUEST-120'].pendingItems.map(i=>i.uid);p=JSON.parse(JSON.stringify(r.state));p.inventory.splice(1,2);r=claim(p,'QUEST-120');assert.equal(r.outcome.xpAwarded,0);assert.deepEqual(r.outcome.delivered.map(i=>i.inventoryUid),pending);
});
test('scroll selection requires one valid choice, persists with a pending reward, and cannot switch later',()=>{
 const p=ready(hero(),'QUEST-125'),before=structuredClone(p);for(const choice of [undefined,'wardens_blade','weapon_scroll_improved'])assert.throws(()=>claim(p,'QUEST-125',choice,()=>{throw Error('generated before validation');}),/quest-reward-choice-required/);assert.deepEqual(p,before);
 p.inventory=Array.from({length:42},()=>item('ether'));const r=claim(p,'QUEST-125','armor_scroll');assert.equal(r.outcome.status,'reward-pending');assert.throws(()=>claim(r.state,'QUEST-125','weapon_scroll'),/quest-reward-choice-locked/);
 r.state.inventory.pop();const receive=claim(r.state,'QUEST-125');assert.equal(receive.outcome.xpAwarded,0);assert.equal(receive.outcome.delivered[0].id,'armor_scroll');
});
test('reward failures never mutate the original; gear and duplicate or cross-class UIDs are rejected',()=>{
 const p=ready(hero(),'QUEST-110');p.storage=[item('potion')];const before=structuredClone(p);
 assert.throws(()=>claim(p,'QUEST-110',undefined,()=>p.storage[0].uid),/duplicate-reward-uid/);assert.deepEqual(p,before);
 assert.throws(()=>claimProgressionQuest(p,{questId:'QUEST-110'},context('QUEST-110'),uid,()=>({slot:'weapon'})),/quest-gear-reward-forbidden/);assert.deepEqual(p,before);
 const book=ready(hero('mage'),'QUEST-150');assert.throws(()=>claim({...book,classId:'ranger'},'QUEST-150'),/quest-class-changed/);
});
test('an external legacy claimed status wins over a new unclaimed record and archives the conflict without minting',()=>{
 const p=ready(hero(),'QUEST-150');p.bookQuests.book_knight_50='claimed';const r=claim(p,'QUEST-150',undefined,()=>{throw Error('duplicate from old path');});assert.equal(r.outcome.xpAwarded,0);assert.equal(r.outcome.delivered.length,0);assert.equal(r.state.progressionQuests.reconciliations.length,1);assert.equal(r.state.progressionQuests.reconciliations[0].previous.status,'ready');
});
test('SQLite transaction contract stores reward and receipt together, survives restart and rejects a changed payload',t=>{
 const directory=mkdtempSync(join(tmpdir(),'varendor-progression-')),file=join(directory,'world.sqlite');let store=new WorldStore(file);
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 let p=ready(hero(),'QUEST-110');store.save({characters:{hero:p}});const persistedBefore=store.load(),request={questId:'QUEST-110'},draft=claim(p,'QUEST-110'),receipt={ok:true,outcome:draft.outcome};
 store.db.exec("CREATE TRIGGER fail_progression BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'progression-write-failed'); END;");assert.throws(()=>store.commit({characters:{hero:draft.state}},'hero','one-claim',request,receipt),/progression-write-failed/);assert.deepEqual(store.load(),persistedBefore);assert.equal(store.receipt('hero','one-claim',request),null);
 store.db.exec('DROP TRIGGER fail_progression');store.commit({characters:{hero:draft.state}},'hero','one-claim',request,receipt);store.close();store=new WorldStore(file);assert.deepEqual(store.receipt('hero','one-claim',request),receipt);p=store.load().characters.hero;assert.equal(claim(p,'QUEST-110').outcome.delivered.length,0);assert.throws(()=>store.receipt('hero','one-claim',{questId:'QUEST-120'}),/command-id-conflict/);
});
test('views expose fixed rewards, binding readiness and legacy credit, while leaving all source state untouched',()=>{
 const p={...hero('ranger'),bookQuests:{book_ranger_50:'ready'}},before=structuredClone(p),views=progressionQuestViews(p,EMPTY_PROGRESSION_BINDINGS);assert.deepEqual(p,before);assert.equal(views.length,10);
 const book=views.find(v=>v.id==='QUEST-150');assert.equal(book.status,'ready');assert.equal(book.legacyCredit,true);assert.equal(book.requirementsAvailable,false);assert.deepEqual(book.rewards,[{id:'book_ranger_50',count:1}]);assert.ok(book.objectives[0].text.includes('Сектант'));
 const choice=views.find(v=>v.id==='QUEST-125');assert.equal(choice.rewardChoices.length,2);assert.deepEqual(choice.rewards,[]);
});
