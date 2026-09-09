import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SKILL_BOOKS} from '../src/data/skill-books.ts';
import {CLASSES,ITEMS,MONSTERS} from '../src/data/game-data.ts';
import {rollLootV3,GOLEM_EQUIPMENT,WARDEN_EQUIPMENT} from '../src/data/loot-v3.ts';
import {calculateEquipmentStats} from '../src/core/equipment-stats.ts';
import {quickDefaults,normalizeQuickbar} from '../src/controls/quickbar.ts';
import {SERVICES} from '../src/world/territory.ts';
import {classCombatProfile} from '../src/core/game-rules.ts';
import {readFileSync} from 'node:fs';
import {restoreWorldTopology} from '../src/world/world-topology.ts';
import {isTerritorySafe} from '../src/world/territory.ts';
class Store{
 state=null;receipts=new Map();writes=0;fail=false;
 load(){return structuredClone(this.state);}
 save(state){this.state=structuredClone(state);this.writes++;}
 receipt(id,key){return this.receipts.get(id+key)??null;}
 commit(state,id,key,payload,receipt){if(this.fail)throw Error('disk-full');this.save(state);this.receipts.set(id+key,receipt);}
}
function setup(classId='knight',xpRate=20){let serial=0;const store=new Store();const options={store,collision:new CollisionWorld(),now:1000,identifier:()=>`content-${++serial}`,random:()=>.5,xpRate};const w=new WorldSimulation(options);const original=w.createCharacter('QA',classId);const id=original.id;
 Object.assign(original,{level:60,x:50,z:50,mp:9999,hp:9999,activeUntil:1e9});w.recalculate(original);original.mp=original.maxMp;
 w.state.monsters=w.state.monsters.filter(m=>m.id==='wolf').slice(0,1);const m=w.state.monsters[0];Object.assign(m,{x:51.5,z:50,home:{x:51.5,z:50},hp:100000,attackReadyAt:1e9});
 const item=book=>({uid:`item-${++serial}`,id:book,plus:0,count:1});
 const command=c=>w.command(id,`command-${++serial}`,c);
 return {w,store,options,id,m,item,command,get p(){return w.state.characters[id];}};
}
test('all 30 books execute their server-owned effect and remain in the bag',()=>{
 for(const b of Object.values(SKILL_BOOKS)){
  const f=setup(b.classId);f.p.inventory.push(f.item(b.id));const before=f.p.inventory.length;const mp=f.p.mp;
  const result=f.command({type:'castBook',bookId:b.id,targetId:b.mode==='ally'?f.id:f.m.uid,point:{x:51.5,z:50}});
  assert.equal(result.ok,true,`${b.id}: ${result.reason}`);assert.equal(f.p.inventory.length,before);assert.equal(f.p.bookCooldowns[b.id],1000+b.cd*1000);
  assert.equal(f.p.mp,mp-b.cost);assert.ok(f.w.events.some(e=>e.bookId===b.id));
 }
});
test('book ownership, class, level, cooldown and old-skill bypass are enforced',()=>{
 const f=setup();const cast=()=>f.command({type:'castBook',bookId:'book_knight_20'});
 assert.equal(cast().reason,'book-not-owned');f.p.inventory.push(f.item('book_knight_20'));f.p.level=19;assert.equal(cast().reason,'book-level');f.p.level=20;
 assert.equal(cast().ok,true);f.w.advance(1400);assert.equal(cast().reason,'cooldown');
 f.p.inventory.push(f.item('book_mage_20'));assert.equal(f.command({type:'castBook',bookId:'book_mage_20'}).reason,'class-restricted');
 assert.throws(()=>f.w.input(f.id,1,{type:'attack',entityId:f.m.uid,skill:0}),/book-required/);
 assert.ok(quickDefaults().every(x=>!x.action.startsWith('skill:')));assert.ok(normalizeQuickbar([{action:'skill:0'}]).every(x=>!x.action.startsWith('skill:')));
});
test('purchases are atomic, idempotent, capital-only and books retain cooldown on restart',()=>{
 const f=setup();f.p.gold=999999;const request={type:'buy',itemId:'book_knight_10'};
 assert.equal(f.command(request).reason,'shop-unavailable');Object.assign(f.p,{x:-98,z:-80});
 const receipt=f.w.command(f.id,'purchase-once',request);assert.equal(receipt.ok,true);assert.equal(f.p.gold,997999);
 assert.deepEqual(f.w.command(f.id,'purchase-once',request),receipt);assert.equal(f.p.gold,997999);assert.equal(f.p.inventory.filter(i=>i.id===request.itemId).length,1);
 f.store.fail=true;assert.throws(()=>f.command({type:'buy',itemId:'book_knight_20'}),/disk-full/);assert.equal(f.p.gold,997999);assert.ok(!f.p.inventory.some(i=>i.id==='book_knight_20'));f.store.fail=false;
 Object.assign(f.p,{x:50,z:50});assert.equal(f.command({type:'castBook',bookId:request.itemId,targetId:f.m.uid}).ok,true);
 const deadline=f.p.bookCooldowns[request.itemId];const restarted=new WorldSimulation({...f.options,now:1400});assert.equal(restarted.state.characters[f.id].bookCooldowns[request.itemId],deadline);
});
test('Balance changes maximum HP once, heals by original maximum and expires cleanly',()=>{
 const f=setup();f.p.inventory.push(f.item('book_knight_50'));const base=f.p.maxHp;f.p.hp=100;
 assert.equal(f.command({type:'castBook',bookId:'book_knight_50'}).ok,true);assert.equal(f.p.maxHp,Math.round(base*1.45));assert.equal(f.p.hp,100+Math.round(base*.45));
 f.w.recalculate(f.p);assert.equal(f.p.maxHp,Math.round(base*1.45));f.p.activeUntil=0;f.w.advance(421100);assert.equal(f.p.maxHp,base);
});
test('poison refresh does not stack and deals 3.5 percent over five ticks',()=>{
 const f=setup('assassin');f.p.inventory.push(f.item('book_assassin_30'));f.command({type:'castBook',bookId:'book_assassin_30'});
 f.w.books.physicalHit(f.p,f.m);f.w.books.physicalHit(f.p,f.m);assert.equal(f.m.bookDots.length,1);const before=f.m.hp;f.w.advance(6001);
 assert.equal(before-f.m.hp,Math.round(MONSTERS.wolf.hp*.035));
});
test('each foreign assassin piece subtracts fixed defenses; knight chest stays exclusive',()=>{
 const items={head:{id:'fallen_helm',plus:3},boots:{id:'grave_boots',plus:2}};
 const def=i=>ITEMS[i.id];const base=calculateEquipmentStats('assassin',CLASSES.assassin.stats,20,items,i=>({...def(i),assassinForeign:false}));const actual=calculateEquipmentStats('assassin',CLASSES.assassin.stats,20,items,def);
 for(const key of ['def','mdef','evasion'])assert.equal(actual.stats[key],base.stats[key]-4);
 assert.deepEqual(ITEMS.rift_plate.classes,['knight']);assert.deepEqual(ITEMS.shade_chest.classes,['assassin']);
 const f=setup('mage');const chest=f.item('rift_plate');f.p.equipment.chest=chest;f.w.checkpoint();const restarted=new WorldSimulation({...f.options,now:1100});const p=restarted.state.characters[f.id];assert.equal(p.equipment.chest,undefined);assert.ok(p.inventory.some(i=>i.uid===chest.uid));
});
test('XP multiplier applies once; identical kills preserve silver and loot',()=>{
 const a=setup('knight',1),b=setup('knight',20);for(const f of [a,b]){f.p.level=1;f.p.xp=0;f.w.damage(f.m,1e6,f.p,false);}
 const x=a.w.events.find(e=>e.kind==='loot'),y=b.w.events.find(e=>e.kind==='loot');assert.equal(y.xp,x.xp*20);assert.equal(y.gold,x.gold);assert.deepEqual(y.items,x.items);
});
test('loot excludes books, mixes equipment, and guarantees boss weapon/armor/ordinary piece',()=>{
 let seed=391;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 let equips=0;const found=new Set();for(let i=0;i<10000;i++){const drops=rollLootV3('wolf',random);for(const d of drops){assert.ok(ITEMS[d.id]);assert.ok(!d.id.startsWith('book_'));if(ITEMS[d.id].slot){equips++;found.add(d.id);}}}
 assert.ok(equips>2300&&equips<2700);assert.equal(found.size,5);
 for(let i=0;i<100;i++){const drops=rollLootV3('rift_boss',random);assert.equal(drops.filter(d=>WARDEN_EQUIPMENT.slice(0,5).includes(d.id)).length,1);assert.equal(drops.filter(d=>WARDEN_EQUIPMENT.slice(5).includes(d.id)).length,1);assert.equal(drops.filter(d=>GOLEM_EQUIPMENT.includes(d.id)).length,1);}
});

function giveCast(f,id,extra={}){f.p.inventory.push(f.item(id));const result=f.command({type:'castBook',bookId:id,targetId:f.m.uid,...extra});assert.equal(result.ok,true,`${id}: ${result.reason}`);}
test('ranger dexterity changes physical damage, accuracy, crit, evasion and cadence together',()=>{
 const f=setup('ranger'),before={...f.p.stats},cadence=classCombatProfile('ranger',60,before).attackInterval;
 giveCast(f,'book_ranger_20');assert.equal(f.p.stats.dex,before.dex+10);assert.equal(f.p.stats.atkMin,before.atkMin+23);assert.equal(f.p.stats.accuracy,before.accuracy+18);assert.ok(Math.abs(f.p.stats.crit-before.crit-1.7)<1e-8);assert.equal(f.p.stats.evasion,before.evasion+4.5);assert.ok(classCombatProfile('ranger',60,f.p.stats).attackInterval<cadence);
});
test('knight run/attack and defense buffs expire; taunt releases only unstruck enemies',()=>{
 const f=setup(),before={...f.p.stats};giveCast(f,'book_knight_20');assert.equal(f.p.stats.speed,before.speed*1.1);assert.equal(f.w.books.attackSpeed(f.p),1.08);
 f.w.advance(1400);giveCast(f,'book_knight_30');assert.equal(f.p.stats.def,before.def+5);
 f.w.advance(1800);const untouched=structuredClone(f.m);untouched.uid='untouched';untouched.x=53;f.w.state.monsters.push(untouched);giveCast(f,'book_knight_40');
 f.w.damage(f.m,1,f.p,false);f.w.state.time=16801;f.w.books.tick();assert.equal(untouched.returnFromTaunt,true);assert.ok(!f.m.returnFromTaunt);
 f.w.state.time=122000;f.w.books.tick();assert.equal(f.p.stats.def,before.def);assert.equal(f.p.stats.speed,before.speed);
});
test('assassin invisibility survives an interrupted windup and ends on actual contact',()=>{
 const f=setup('assassin');giveCast(f,'book_assassin_40');f.p.target=f.m.uid;f.p.yaw=Math.PI/2;f.p.stats.accuracy=100;f.w.beginPlayerAttack(f.p,f.m);
 assert.ok(f.w.books.value(f.p,'invisible'));f.w.cancelAttack(f.p.id);assert.ok(f.w.books.value(f.p,'invisible'));
 const before=f.m.hp;f.w.strike({actor:f.id,target:f.m.uid,generation:f.m.generation,actorGeneration:f.p.generation,skill:null,damage:100,critical:false,accuracy:100});
 assert.equal(before-f.m.hp,150);assert.equal(f.w.books.value(f.p,'invisible'),0);
});
test('poison continues behind cover; retaliation stops damaging outside melee range',()=>{
 const f=setup('assassin');giveCast(f,'book_assassin_30');f.w.books.physicalHit(f.p,f.m);f.w.lineOfSight=()=>false;
 let before=f.m.hp;f.w.state.time=6000;for(let t=2000;t<=6000;t+=1000){f.w.state.time=t;f.w.books.tick();}assert.equal(before-f.m.hp,Math.round(MONSTERS.wolf.hp*.035));
 f.w.lineOfSight=()=>true;f.w.state.time=6500;giveCast(f,'book_assassin_60');f.w.books.attacked(f.p,f.m);before=f.m.hp;f.w.state.time=7500;f.w.books.tick();assert.equal(before-f.m.hp,75);
 f.m.x=60;before=f.m.hp;f.w.state.time=8500;f.w.books.tick();assert.equal(f.m.hp,before);
});
test('curse applies both defense penalties and attack slowdown; sleep cancels pending contact',()=>{
 const f=setup('necro');giveCast(f,'book_necro_30');for(const [key,n] of [['defDown',10],['mdefDown',10],['attackSlow',7]])assert.equal(f.w.books.value(f.m,key),n);
 f.w.state.time=1400;f.w.state.pending.push({actor:f.m.uid,target:f.id,monster:true,hitAt:1500,endsAt:1800,generation:f.p.generation,actorGeneration:f.m.generation,skill:null});giveCast(f,'book_necro_60');assert.ok(!f.w.state.pending.some(a=>a.actor===f.m.uid));assert.equal(f.w.books.value(f.m,'sleep'),1);
 f.w.state.time=2900;f.w.books.tick();assert.equal(f.w.books.value(f.m,'sleep'),0);
});
test('storm delivers five defense-based pulses, oblivion hits at most four targets per wave',()=>{
 const mage=setup('mage');const expected=Math.round((mage.p.stats.def+mage.p.stats.mdef)*.3);giveCast(mage,'book_mage_50',{point:{x:51.5,z:50}});const before=mage.m.hp;
 for(let t=2000;t<=6000;t+=1000){mage.w.state.time=t;mage.w.books.tick();}assert.equal(before-mage.m.hp,expected*5);assert.equal(mage.w.state.bookAreas[0].remaining,0);
 const f=setup('necro');for(let i=1;i<6;i++){const m=structuredClone(f.m);m.uid='area-'+i;m.x+=i*.1;f.w.state.monsters.push(m);}giveCast(f,'book_necro_50',{point:{x:51.5,z:50}});
 for(let t=1700;t<=3100;t+=700){f.w.state.time=t;f.w.books.tick();}const damaged=f.w.state.monsters.filter(m=>m.hp<100000);assert.equal(damaged.length,4);for(const m of damaged)assert.equal(100000-m.hp,Math.round(f.p.stats.matk*1.2)*3);
});
test('trap hits each enemy generation once and is represented on the native wire',()=>{
 const f=setup('ranger');f.p.yaw=Math.PI/2;giveCast(f,'book_ranger_60');const trap=f.w.state.bookTraps[0];assert.equal(trap.point.x,51.8);assert.equal(f.w.snapshot(f.id).groundEffects[0].radius,1.4);
 const before=f.m.hp;f.w.books.tick();const damage=before-f.m.hp;assert.ok(damage>0);f.w.books.tick();assert.equal(before-f.m.hp,damage);
 f.p.generation++;f.w.books.tick();assert.equal(trap.expiresAt,f.w.state.time);
});
test('summons use their specified damage and expire when owner generation changes',()=>{
 for(const [classId,book,kind,life] of [['necro',20,'skeleton',7],['necro',40,'fire_golem',115],['mage',60,'infernal',15]]){
  const f=setup(classId);giveCast(f,`book_${classId}_${book}`);const summon=f.w.state.summons[0];assert.equal(summon.bookKind,kind);assert.equal(summon.expiresAt,1000+life*1000);
  f.w.state.time=1500;const before=f.m.hp;f.w.books.summonTick(summon,.05,()=>{});const physical=(f.p.stats.atkMin+f.p.stats.atkMax)/2;
  const expected=kind==='fire_golem'?Math.round(MONSTERS.wolf.hp*.03):kind==='infernal'?Math.round(physical)+Math.round(f.p.stats.matk):Math.round(physical);assert.equal(before-f.m.hp,expected);
  f.p.generation++;f.w.books.summonTick(summon,.05,()=>{});assert.equal(summon.expiresAt,f.w.state.time);
 }
});
test('level 50/60 books require the correct boss quest and are granted once at Arden',()=>{
 for(const level of [50,60]){
  const f=setup('mage');Object.assign(f.p,SERVICES['npc:asterhold:elder']);f.p.level=level-1;assert.equal(f.command({type:'bookQuest',level}).reason,'book-level');f.p.level=level;
  assert.equal(f.command({type:'bookQuest',level}).ok,true);const id=`book_mage_${level}`;assert.equal(f.p.bookQuests[id],'active');assert.ok(!f.p.inventory.some(i=>i.id===id));
  Object.assign(f.p,{x:50,z:50});f.m.id=level===50?'big':'rift_boss';f.w.damage(f.m,1e6,f.p,false);assert.equal(f.p.bookQuests[id],'ready');assert.equal(f.command({type:'bookQuest',level}).reason,'elder-unavailable');
  Object.assign(f.p,SERVICES['npc:asterhold:elder']);assert.equal(f.command({type:'bookQuest',level}).ok,true);assert.equal(f.p.inventory.filter(i=>i.id===id).length,1);assert.equal(f.command({type:'bookQuest',level}).reason,'already-claimed');
 }
});
test('failed damaging book transaction rolls back rewards, effects, hit events and aggro caches',()=>{
 const f=setup();f.p.inventory.push(f.item('book_knight_10'));f.store.fail=true;const before=structuredClone(f.w.state),events=structuredClone(f.w.events);
 assert.throws(()=>f.command({type:'castBook',bookId:'book_knight_10',targetId:f.m.uid}),/disk-full/);assert.deepEqual(f.w.state,before);assert.deepEqual(f.w.events,events);assert.equal(f.w.brains.size,0);
});
test('102 permanent mobs spawn outside buildings/sanctuaries and existing deaths keep their deadlines',()=>{
 const store=new Store(),topology=restoreWorldTopology(JSON.parse(readFileSync(new URL('../public/assets/world/world-topology.json',import.meta.url),'utf8')));let id=0;
 const options={store,...topology,identifier:()=>`spawn-${++id}`,random:()=>.5,now:1000};const w=new WorldSimulation(options);
 assert.equal(w.state.monsters.filter(m=>m.nightIndex===undefined).length,102);
 for(const [id,count] of [['fire_golem',12],['ice_golem',12],['rift_boss',1]]){
  const mobs=w.state.monsters.filter(m=>m.id===id);assert.equal(mobs.length,count);
  for(const m of mobs){assert.equal(isTerritorySafe(m.home),false);assert.equal(topology.collision.isBlocked(m.home,w.monsterRadius(m)),false);assert.ok(Number.isFinite(topology.terrain.supportAt(m.x,m.z)));}
 }
 const m=w.state.monsters.find(m=>m.id==='ice_golem');Object.assign(m,{hp:0,alive:false,respawnAt:900000,deathAt:1000,corpseUntil:4000});w.checkpoint();
 const restored=new WorldSimulation({...options,now:2000});assert.equal(restored.state.monsters.length,102);assert.equal(restored.state.monsters.find(x=>x.uid===m.uid).respawnAt,900000);
});
test('new mob leash clears encounter HP, ownership and damage-over-time without rewards',()=>{
 const f=setup();Object.assign(f.m,{id:'fire_golem',hp:12,x:90,z:50,home:{x:51.5,z:50},owner:f.id,provokedBy:f.id});f.w.books.dot(f.m,f.p,'fire',12,7);const before=f.p.gold;
 f.w.monsterTick(f.m,.05);assert.equal(f.m.hp,MONSTERS.fire_golem.hp);assert.equal(f.m.owner,undefined);assert.deepEqual(f.m.bookDots,[]);assert.equal(f.p.gold,before);
});
test('evasion and foreign-piece penalties affect incoming hits; retaliation triggers on an evaded attack',()=>{
 const f=setup('assassin');giveCast(f,'book_assassin_60');f.p.stats.evasion=51;const hp=f.p.hp;f.w.monsterHit(f.m,f.p);assert.equal(f.p.hp,hp);assert.equal(f.m.bookDots[0].id,'lightning');
 f.p.stats.evasion-=2;f.w.monsterHit(f.m,f.p);assert.ok(f.p.hp<hp);
});
test('boss ground slam advertises exact radius and resolves once against players still inside',()=>{
 const f=setup();Object.assign(f.m,{id:'rift_boss',hp:MONSTERS.rift_boss.hp,x:51.5,z:50,attackReadyAt:0});f.w.monsterTick(f.m,.05);
 const attack=f.w.state.pending.find(a=>a.actor===f.m.uid);assert.ok(attack.slam);assert.equal(Math.round(attack.hitAt-f.w.state.time),1400);assert.equal(f.w.snapshot(f.id).groundEffects.find(z=>z.kind==='slam').radius,4);
 const before=f.p.hp;f.p.x=45;f.w.resolveAttack(attack);assert.equal(f.p.hp,before,'leaving the marked radius avoids impact');
 f.p.x=50;f.w.resolveAttack(attack);assert.equal(before-f.p.hp,Math.max(1,Math.round(90*1.4-f.p.stats.def*.2)));
 const count=f.w.state.monsters.length;f.w.damage(f.m,4501,f.p,false);assert.equal(f.m.phase,2);assert.equal(f.w.state.monsters.length,count,'phase two adds no summons or hidden damage multiplier');
});
