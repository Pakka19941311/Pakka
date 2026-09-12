import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeP2Geography,makeP2Simulation,equipP2Reference,stepP2} from './p2-combat-smoke.mjs';
import {fight} from './p2-golem-book-audit.mjs';
import {p2Encounter} from '../../src/data/p2-encounters.ts';
import {resolveTypedMonsterDamage} from '../../src/core/monster-damage.ts';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=n=>Number(n.toFixed(3));
const files=['src/core/monster-damage.ts','src/core/encounter-combat-v3.ts','src/server/world-simulation.ts','src/server/book-system.ts',
 'src/data/game-data.ts','src/data/p2-encounters.ts','src/data/skill-books.ts','scripts/world_expansion_v3/book-typed-control.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
function p2BookFight(geography){
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Typed mage10','mage');equipP2Reference(sim,p,10,3);
 const wolves=sim.state.monsters.filter(m=>m.canonicalMobId==='MOB-02');let m,point;
 for(const target of sim.state.monsters.filter(m=>m.canonicalMobId==='MOB-05'&&m.level===8)){
  for(let i=0;i<32;i++){
   const q={spaceId:'surface',x:target.x+6*Math.cos(i*Math.PI/16),z:target.z+6*Math.sin(i*Math.PI/16)};
   if(geography.safe(q)||geography.space(q).collision.isBlocked(q,.46)||!sim.lineOfSight(q,target)||wolves.some(w=>dist(w,q)<8.5))continue;
   m=target;point=q;break;
  }if(m)break;
 }
 if(!m)throw Error('no-real-p2-book-standing-point');
 Object.assign(p,point,{yaw:Math.atan2(m.x-point.x,m.z-point.z)});sim.heartbeat(p.id);
 p.inventory.push({uid:'typed-control-book',id:'book_mage_10',count:1,plus:0});
 const start=sim.state.time,initial={hp:p.hp,mp:p.mp,gold:p.gold,targetHp:m.hp},definition=p2Encounter(m),raw=Math.round(p.stats.matk*1.5);
 const cast=sim.command(p.id,'typed-control-cast',{type:'castBook',bookId:'book_mage_10',targetId:m.uid});
 if(!cast.ok)throw Error(cast.reason);
 const bookHit=sim.events.find(e=>e.kind==='hit'&&e.target===m.uid),paidMp=initial.mp-p.mp;
 let seq=0,lastHp=m.hp,resets=0;const trace=[];
 if(m.alive)sim.input(p.id,++seq,{type:'attack',entityId:m.uid,skill:null,mode:'auto'});
 while(m.alive&&!p.dead&&sim.state.time-start<90000){stepP2(sim,100);if(m.hp>lastHp)resets++;lastHp=m.hp;
  if(!trace.length||sim.state.time-trace.at(-1).at>=500)trace.push({at:sim.state.time,x:round(p.x),z:round(p.z),heroHp:p.hp,targetHp:m.hp,distance:round(dist(p,m))});}
 const events=sim.events.filter(e=>e.actor===p.id||e.target===p.id||e.actor===m.uid||e.target===m.uid),death=events.find(e=>e.kind==='death'&&e.actor===m.uid);
 return {classId:'mage',level:10,targetLevel:m.level,mobId:m.canonicalMobId,targetUid:m.uid,population:sim.state.monsters.length,definition,
  initial,final:{hp:p.hp,mp:p.mp,gold:p.gold,targetHp:m.hp},equipment:p.equipment,stats:p.stats,cast,paidMp,bookRaw:raw,bookHit,
  expectedBookDamage:resolveTypedMonsterDamage({raw,type:'magic',element:'fire',source:'book',critical:true},definition),
  killed:!m.alive,heroDead:p.dead,ttk:round(((death?.at??sim.state.time)-start)/1000),targetHpResets:resets,
  damageTaken:events.filter(e=>e.kind==='hit'&&e.target===p.id).reduce((n,e)=>n+e.amount,0),loot:events.filter(e=>e.kind==='loot'),events,trace,
  method:'One initial synthetic level10/starter+3/owned-book fixture, original full-HP authored beetle8, full1151. One legal cast and normal auto attack, actual physics/AI/projectiles/loot. No HP/MP/loot/stat/AI manipulation after setup. No native claim.'};
}
const before=hashes(),geography=makeP2Geography();
const p2=p2BookFight(geography),legacy=fight(geography,{classId:'necro',level:40,targetId:'rift_boss',bookId:'book_necro_40'});
const report={schema:1,stage:'typed-damage-live-control',sourceHashes:before,sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(hashes()),p2,legacy,
  historicalAuditSha256:createHash('sha256').update(readFileSync('docs/world-expansion-v3/P2_GOLEM_BOOK_AUDIT.json')).digest('hex'),
  limits:['No legacy defense or AI change. Rift remains vulnerable to ranged summon kiting.','No HP-percent cap; 3%/3.5% raw parameters remain.','P2 full1151 mage control; legacy boss control is isolated on real terrain.','Server-only, synthetic characters, no personal saves.']};
writeFileSync('docs/world-expansion-v3/BOOK_TYPED_DAMAGE_CONTROL.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({p2:{killed:p2.killed,ttk:p2.ttk,bookRaw:p2.bookRaw,bookHit:p2.bookHit?.amount,expected:p2.expectedBookDamage,damageTaken:p2.damageTaken,loot:p2.loot.length,population:p2.population},legacy:{killed:legacy.killed,ttk:legacy.ttk,hits:legacy.outgoingHits.length,damageTaken:legacy.damageTaken,loot:legacy.loot.length,failure:legacy.failure}},null,2));
if(report.sourcesChangedDuringRun||!p2.killed||p2.heroDead||p2.bookHit?.amount!==p2.expectedBookDamage||p2.loot.length!==1||!legacy.killed||legacy.failure||legacy.loot.length!==1)process.exitCode=1;
