import test from 'node:test';
import assert from 'node:assert/strict';
import {BookSystem} from '../src/server/book-system.ts';
import {resolveTypedMonsterDamage,savedBookDamageChannel,legacyStatusDotChannel,PHYSICAL_DAMAGE,FIRE_DAMAGE} from '../src/core/monster-damage.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {P2MemoryStore,makeP2Geography,makeP2Simulation,equipP2Reference} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {p2Encounter} from '../src/data/p2-encounters.ts';
import {readFileSync} from 'node:fs';

function controlled(classId='mage',hp=10000,defense={def:150,mdef:50,resistances:{fire:.25,poison:.1}}){
 let fixtureSerial=0;const sim=new WorldSimulation({store:new P2MemoryStore(),collision:new CollisionWorld(),now:1000,random:()=>.5,identifier:()=>`fixture-${++fixtureSerial}`});
 const p=sim.createCharacter('Typed',classId);p.level=60;sim.recalculate(p);
 Object.assign(p,{x:50,z:50,hp:p.maxHp,mp:p.maxMp,activeUntil:1e9});
 Object.assign(p.stats,{atkMin:100,atkMax:100,matk:200,physicalAccuracy:100,magicAccuracy:100,def:50,mdef:50});
 const m=structuredClone(sim.state.monsters[0]);Object.assign(m,{x:51.5,z:50,hp,alive:true,bookEffects:[],bookDots:[]});
 let now=1000,serial=0,visible=true,random=.5;
 const areas=[],traps=[],summons=[],packets=[],events=[];
 const host={now:()=>now,heroes:()=>[p],monsters:()=>[m],areas:()=>areas,traps:()=>traps,summons:()=>summons,
  random:()=>random,uid:()=>`typed-${++serial}`,hp:()=>hp,safe:()=>false,visible:()=>visible,
  damage:(_m,packet)=>{packets.push({...packet});const amount=resolveTypedMonsterDamage(packet,defense,{defDown:books.value(m,'defDown'),mdefDown:books.value(m,'mdefDown')});m.hp=Math.max(0,m.hp-amount);m.alive=m.hp>0;events.push({kind:'hit',amount});},
  event:(kind,actor,target,extra)=>events.push({kind,actor,target,...extra}),recalculate:()=>{},provoke:()=>{},release:()=>{},cancel:()=>{},summonPoint:()=>({x:51,z:50,spaceId:p.spaceId})};
 const books=new BookSystem(host);
 const cast=id=>{p.inventory.push({id,uid:id,count:1,plus:0});books.cast(p,id,m.uid,{x:m.x,z:m.z,spaceId:p.spaceId});};
 return {p,m,books,areas,traps,summons,packets,events,cast,hp,defense,setTime:t=>now=t,setVisible:v=>visible=v,setRandom:r=>random=r};
}
test('explicit book channels override FX; owner buff and critical flag are applied once',()=>{
 for(const [classId,type,element,raw,expected]of [['knight','physical','none',150,75],['mage','magic','fire',300,169],['necro','magic','shadow',300,225]]){
  const f=controlled(classId);f.cast(`book_${classId}_10`);assert.equal(f.m.hp,10000-expected);
  assert.deepEqual(f.packets[0],{type,element,raw,source:'book',critical:true,bookId:`book_${classId}_10`});
 }
 const f=controlled();f.books.effect(f.p,'owner-buff',f.p.id,60,{damage:100});f.books.hit(f.p,f.m,100,'slash',FIRE_DAMAGE);
 assert.equal(f.packets[0].raw,200);assert.equal(10000-f.m.hp,113,'magic/fire despite slash FX, buff once');
});
test('curse reduces only real matching defense, never creates negative defense bonus',()=>{
 const f=controlled();f.books.effect(f.m,'curse',f.p.id,60,{defDown:100,mdefDown:10});
 f.books.hit(f.p,f.m,100,'fire',PHYSICAL_DAMAGE);assert.equal(10000-f.m.hp,75);
 assert.equal(resolveTypedMonsterDamage({raw:100,...FIRE_DAMAGE,source:'book',critical:false},{},{mdefDown:100}),100);
 assert.equal(resolveTypedMonsterDamage({raw:0,...FIRE_DAMAGE,source:'dot',critical:false},{def:100,mdef:100}),0);
});
test('golem keeps exact raw 3 percent for two HP scales; target MDEF/fire resistance resolve once',()=>{
 for(const hp of [899,90000]){
  const f=controlled('necro',hp);f.cast('book_necro_40');f.setTime(1500);f.books.summonTick(f.summons[0],.05,()=>{});
  assert.equal(f.packets[0].raw,hp*.03);assert.equal(f.packets[0].type,'magic');assert.equal(f.packets[0].element,'fire');
  assert.equal(hp-f.m.hp,Math.round(hp*.03*.75*.75));assert.equal(f.summons[0].attackReadyAt,2500);
  assert.equal(f.summons[0].expiresAt,116000);assert.equal(f.p.bookCooldowns.book_necro_40,141000);
 }
});
test('poison raw carry remains 3.5 percent, refresh does not stack/restart and ticks never roll accuracy or recurse',()=>{
 const f=controlled('assassin',899);f.cast('book_assassin_30');f.books.physicalHit(f.p,f.m);
 f.setTime(1700);f.books.physicalHit(f.p,f.m);assert.equal(f.m.bookDots.length,1);assert.equal(f.m.bookDots[0].nextAt,2000);
 f.setVisible(false);f.setRandom(0);const deadline=f.m.bookDots[0].expiresAt;
 for(let t=2000;t<=6000;t+=1000){f.setTime(t);f.books.tick();}
 assert.equal(f.packets.reduce((s,p)=>s+p.raw,0),Math.round(899*.035));assert.ok(f.packets.every(p=>p.type==='physical'&&p.element==='poison'));
 assert.equal(f.m.bookDots[0].expiresAt,deadline);assert.equal(f.events.filter(e=>e.kind==='miss').length,0);
 assert.equal(899-f.m.hp,f.packets.reduce((s,p)=>s+Math.round(p.raw*.5*.9),0));
 const tiny=controlled('assassin',10);tiny.cast('book_assassin_30');tiny.books.physicalHit(tiny.p,tiny.m);
 for(let t=2000;t<=6000;t+=1000){tiny.setTime(t);tiny.books.tick();}assert.equal(tiny.packets.length,0,'zero raw ticks are not minimum-one hits');
});
test('burn and retaliation have explicit magic channels and preserve their different range rules',()=>{
 const burn=controlled('knight');burn.cast('book_knight_60');assert.equal(burn.packets[0].type,'physical');
 assert.equal(burn.m.bookDots[0].damage,27);burn.setVisible(false);burn.setTime(2000);burn.books.tick();assert.deepEqual(burn.packets[1],{...FIRE_DAMAGE,raw:27,source:'dot',critical:false});
 const f=controlled('assassin');f.cast('book_assassin_60');f.books.attacked(f.p,f.m);f.setTime(2000);f.books.tick();
 assert.equal(f.packets[0].raw,75);assert.equal(f.packets[0].element,'none');assert.equal(10000-f.m.hp,56);
 f.m.x=70;f.setTime(3000);f.books.tick();assert.equal(f.packets.length,1);
});
test('area and trap snapshots apply owner scaling once, mitigation at contact, old random trap IDs stay valid',()=>{
 for(const [classId,book,raw,waves,interval,type,element]of [['mage',50,60,5,1000,'magic','none'],['necro',50,480,3,700,'magic','fire'],['ranger',60,600,1,1,'physical','none']]){
  const f=controlled(classId);f.books.effect(f.p,'buff',f.p.id,100,{damage:100});f.p.yaw=Math.PI/2;f.cast(`book_${classId}_${book}`);
  const records=classId==='ranger'?f.traps:f.areas;delete records[0].channel; // Real pre-migration serialized shape.
  f.p.bookEffects=[];for(let i=1;i<=waves;i++){f.setTime(1000+i*interval);f.books.tick();}
  assert.equal(f.packets.length,waves);assert.ok(f.packets.every(p=>p.raw===raw&&p.type===type&&p.element===element));
  if(classId==='ranger'){f.books.tick();assert.equal(f.packets.length,1);assert.deepEqual(f.traps[0].hit,[f.m.uid+':'+f.m.generation]);}
 }
});
test('skeleton and both infernal components retain owner attribution/procs and dead target blocks second contact',()=>{
 for(const [classId,book,types]of [['necro',20,['physical']],['mage',60,['physical','magic']]]){
  const f=controlled(classId);f.cast(`book_${classId}_${book}`);f.setTime(1500);f.books.summonTick(f.summons[0],.05,()=>{});
  assert.deepEqual(f.packets.map(p=>p.type),types);assert.ok(f.packets.every(p=>p.source==='summon'));
 }
 const f=controlled('mage',40);f.cast('book_mage_60');f.setTime(1500);f.books.summonTick(f.summons[0],.05,()=>{});
 assert.equal(f.m.alive,false);assert.equal(f.packets.length,1);assert.equal(f.events.filter(e=>e.kind==='release').length,1);
});
test('old metadata fallback is explicit; unsupported persisted effects are detected without mutation',()=>{
 assert.deepEqual(savedBookDamageChannel('trap','random-uid'),PHYSICAL_DAMAGE);
 for(const [id,type,element]of [['fire','magic','fire'],['poison','physical','poison'],['lightning','magic','none']])assert.deepEqual(savedBookDamageChannel('dot',id),{type,element});
 assert.deepEqual(legacyStatusDotChannel('ranger'),{type:'physical',element:'poison'});assert.deepEqual(legacyStatusDotChannel('necro'),{type:'magic',element:'shadow'});
 assert.throws(()=>savedBookDamageChannel('dot','unknown'),/unknown-saved-book-damage/);
});

const geography=makeP2Geography();
function runtime(classId='necro'){
 const store=new P2MemoryStore(),sim=makeP2Simulation({geography,store}),p=sim.createCharacter('Persist',classId),m=sim.state.monsters.find(m=>m.canonicalMobId==='MOB-05');
 equipP2Reference(sim,p,60);Object.assign(p,{x:m.x+1.5,z:m.z,yaw:-Math.PI/2,activeUntil:1e9});sim.state.monsters=[m];sim.lineOfSight=()=>true;sim.safe=()=>false;
 return {sim,store,p,m};
}
test('actual WorldSimulation book adapter applies P2 defense once and commits one death/loot for infernal double contact',()=>{
 const f=runtime('mage'),{sim,p,m}=f;p.stats.atkMin=p.stats.atkMax=10000;p.inventory.push({id:'book_mage_60',uid:'owned',count:1,plus:0});
 assert.equal(sim.command(p.id,'typed-book-cmd',{type:'castBook',bookId:'book_mage_60'}).ok,true);
 p.stats.atkMin=p.stats.atkMax=10000;const s=sim.state.summons[0];Object.assign(s,{x:m.x,z:m.z});sim.state.time=1500;sim.books.summonTick(s,.05,()=>{});
 for(const kind of ['hit','death','loot'])assert.equal(sim.events.filter(e=>e.kind===kind&&(e.target===m.uid||e.actor===m.uid)).length,1,kind);
 assert.equal(m.owner,p.id);
});
test('restart of active untyped DoT preserves carry, calendar, owner and wound before typed ticks',()=>{
 const {sim,store,p,m}=runtime('assassin');const now=sim.state.time;
 m.bookDots=[{id:'poison',owner:p.id,expiresAt:now+5000,nextAt:now+1000,damage:4.25,carry:.5}];m.hp-=20;sim.checkpoint();
 const expected=structuredClone(m.bookDots),hp=m.hp;
 const restored=makeP2Simulation({geography,store,now});const current=restored.state.monsters.find(x=>x.uid===m.uid);
 assert.deepEqual(current.bookDots,expected);assert.equal(current.hp,hp);
 const owner=restored.state.characters[p.id];owner.activeUntil=1e9;restored.state.time=now+1000;restored.books.tick();
 assert.equal(hp-current.hp,resolveTypedMonsterDamage({raw:4,type:'physical',element:'poison',source:'dot',critical:false},p2Encounter(current)));
 assert.equal(current.bookDots[0].carry,.75);assert.equal(current.bookDots[0].nextAt,now+2000);
});
test('legacy saved DOT and delayed summon contact both enter typed mitigation without new accuracy rolls',()=>{
 for(const classId of ['assassin','necro']){
  const {sim,p,m}=runtime(classId);sim.random=()=>0;m.status.stun=1e9;Object.assign(m.status,{dot:10000,dotOwner:p.id});
  const before=m.hp,raw=Math.max(2,Math.round(p.stats.matk*.08));sim.monsterTick(m,.05);
  assert.equal(before-m.hp,resolveTypedMonsterDamage({raw,...legacyStatusDotChannel(classId),source:'dot',critical:false},p2Encounter(m)));
  assert.equal(m.status.nextDot,sim.state.time);assert.equal(sim.events.filter(e=>e.kind==='miss').length,0);
 }
 const {sim,p,m}=runtime();sim.state.summons.push({uid:'old-skeleton',owner:p.id,x:m.x+1,z:m.z,yaw:-Math.PI/2,spaceId:m.spaceId,expiresAt:10000});
 const before=m.hp;sim.resolveAttack({actor:'old-skeleton',owner:p.id,target:m.uid,summon:true,damage:100});
 assert.equal(before-m.hp,resolveTypedMonsterDamage({raw:100,...PHYSICAL_DAMAGE,source:'summon',critical:false},p2Encounter(m)));
 assert.equal(sim.events.filter(e=>e.kind==='release'&&e.actor==='old-skeleton').length,1);
});
test('recorded controls distinguish full-population P2 mitigation from the still-open zero-defense legacy boss',()=>{
 const r=JSON.parse(readFileSync('docs/world-expansion-v3/BOOK_TYPED_DAMAGE_CONTROL.json','utf8'));
 assert.equal(r.sourcesChangedDuringRun,false);assert.equal(r.p2.population,1151);assert.equal(r.p2.killed,true);
 assert.equal(r.p2.bookRaw,36);assert.equal(r.p2.bookHit.amount,35);assert.equal(r.p2.expectedBookDamage,35);assert.equal(r.p2.loot.length,1);
 assert.equal(r.legacy.population,1);assert.equal(r.legacy.killed,true);assert.equal(r.legacy.outgoingHits.length,34);
 assert.ok(r.legacy.outgoingHits.every(e=>e.amount===270));assert.equal(r.legacy.damageTaken,0);assert.equal(r.legacy.loot.length,1);
 assert.equal(r.p2.targetHpResets+r.legacy.targetHpResets,0);
});
