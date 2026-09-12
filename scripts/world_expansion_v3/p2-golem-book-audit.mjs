import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MONSTERS} from '../../src/data/game-data.ts';
import {SKILL_BOOKS} from '../../src/data/skill-books.ts';
import {encounterV3} from '../../src/data/encounter-balance-v3.ts';
import {resolveAttackAccuracy} from '../../src/core/attack-accuracy.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {referenceHero,expectedPlayerHit} from './balance.mjs';
import {makeP2Geography,makeP2Simulation,stepP2} from './p2-combat-smoke.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=n=>Number(n.toFixed(3));
const sources=['src/server/world-simulation.ts','src/server/book-system.ts','src/data/game-data.ts','src/data/skill-books.ts',
 'src/data/encounter-balance-v3.ts','src/core/game-rules.ts','src/core/attack-accuracy.ts','src/core/equipment-stats.ts'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));

function driver(geography,{classId,level,targetId,bookId}){
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Audit '+classId,classId);
 const ref=referenceHero(classId,level,3,'live');p.level=level;p.xp=0;p.inventory=[];p.lootBuffer=[];
 p.equipment=Object.fromEntries(Object.entries(ref.equipment).map(([slot,item])=>[slot,{...item,uid:'audit:'+item.id,count:1}]));
 if(bookId)p.inventory.push({id:bookId,uid:'audit:'+bookId,count:1,plus:0});
 sim.recalculate(p);p.hp=p.maxHp;p.mp=p.maxMp;
 const candidates=sim.state.monsters.filter(m=>m.id===targetId&&!m.canonicalMobId);
 let m,stand;
 for(const target of candidates){
  for(let i=0;i<32;i++){
   const q={spaceId:target.spaceId,x:target.x+Math.cos(i*Math.PI/16)*11,z:target.z+Math.sin(i*Math.PI/16)*11};
   if(!geography.safe(q)&&!geography.space(q).collision.isBlocked(q,.46)&&sim.lineOfSight(q,target)){m=target;stand=q;break;}
  }if(m)break;
 }
 if(!m)throw Error('no-real-target-standing-point');
 sim.state.monsters=[m];Object.assign(p,stand,{yaw:Math.atan2(m.x-stand.x,m.z-stand.z)});
 let sequence=0,commandId=0;const input=intent=>sim.input(p.id,++sequence,intent);
 const command=payload=>sim.command(p.id,'audit-cmd-'+(++commandId),payload);
 const tick=ms=>stepP2(sim,ms);
 const trace=[];let walkMetres=0,lastHp=m.hp,resets=0;
 const advance=ms=>{const before={x:p.x,z:p.z};tick(ms);walkMetres+=dist(before,p);if(m.hp>lastHp)resets++;lastHp=m.hp;
  if(!trace.length||sim.state.time-trace.at(-1).at>=500)trace.push({at:sim.state.time,x:round(p.x),z:round(p.z),heroHp:p.hp,targetHp:m.hp,targetDistance:round(dist(p,m)),homeDistance:round(dist(m,m.home)),los:sim.lineOfSight(p,m)});};
 function moveArc(){
  const angle=Math.atan2(p.z-m.home.z,p.x-m.home.x),choices=[];
  for(const radius of [10,11,12])for(const delta of [Math.PI/6,Math.PI/4,-Math.PI/6,-Math.PI/4]){
   const q={spaceId:p.spaceId,x:m.home.x+Math.cos(angle+delta)*radius,z:m.home.z+Math.sin(angle+delta)*radius};
   if(geography.safe(q)||geography.space(q).collision.isBlocked(q,.46)||!pathSegmentIsClear(geography.space(q).collision,p,q,.46)||!sim.lineOfSight(q,m))continue;
   const gap=dist(q,m);if(gap<7||gap>13.5)continue;choices.push({q,score:gap-Math.abs(dist(p,q)-5)*.2});
  }
  choices.sort((a,b)=>b.score-a.score);if(!choices.length)throw Error('no-collision-clear-kite-step');
  input({type:'destination',x:choices[0].q.x,z:choices[0].q.z});let left=6000;
  while(m.alive&&!p.dead&&dist(p,choices[0].q)>.7&&left>0){advance(100);left-=100;}
  if(left<=0)throw Error('kite-navigation-timeout');input({type:'cancel'});
 }
 return {sim,p,m,input,command,advance,moveArc,trace,get walkMetres(){return walkMetres;},get resets(){return resets;}};
}

function fight(geography,recipe){
 const d=driver(geography,recipe),{sim,p,m}=d,start=sim.state.time,initial={hp:p.hp,mp:p.mp,gold:p.gold,targetHp:m.hp};
 let cast=null,failure=null;
 try{
  if(recipe.bookId){cast=d.command({type:'castBook',bookId:recipe.bookId});if(!cast.ok)throw Error(cast.reason);}
  while(m.alive&&!p.dead&&sim.state.time-start<180000){
   if(!recipe.bookId){
    const cursor=sim.state.sequence;d.input({type:'attack',entityId:m.uid,skill:null,mode:'single'});let left=5000;
    while(m.alive&&!p.dead&&left>0&&!sim.events.some(e=>e.sequence>cursor&&e.kind==='release'&&e.actor===p.id)){d.advance(100);left-=100;}
    if(left<=0)throw Error('shot-release-timeout');
   }else d.advance(200);
   if(m.alive&&!p.dead)d.moveArc();
  }
 }catch(error){failure=String(error);}
 const events=sim.events.filter(e=>e.actor===p.id||e.target===p.id||e.actor===m.uid||e.target===m.uid),death=events.find(e=>e.kind==='death'&&e.actor===m.uid);
 return {...recipe,targetUid:m.uid,legacyDefinition:structuredClone(MONSTERS[recipe.targetId]),population:sim.state.monsters.length,
  equipment:p.equipment,stats:p.stats,initial,final:{hp:p.hp,mp:p.mp,gold:p.gold,targetHp:m.hp},killed:!m.alive,heroDead:p.dead,
  failure,ttk:round(((death?.at??sim.state.time)-start)/1000),targetHpResets:d.resets,walkMetres:round(d.walkMetres),cast,
  enemyAttacks:events.filter(e=>e.kind==='attack'&&e.actor===m.uid).length,
  damageTaken:events.filter(e=>e.kind==='hit'&&e.target===p.id).reduce((n,e)=>n+e.amount,0),
  damageDealt:events.filter(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid).reduce((n,e)=>n+e.amount,0),
  incomingHits:events.filter(e=>e.kind==='hit'&&e.target===p.id),outgoingHits:events.filter(e=>e.kind==='hit'&&e.target===m.uid),
  loot:events.filter(e=>e.kind==='loot'),trace:d.trace,
  method:'One synthetic level/current-reference-equipment+3 and initial standing fixture; actual legacy full-HP target at its original home, isolated population. Then ordinary single-attack/destination/cancel or one owned class book plus movement; no resource/HP resets, no edited combat definitions or saves. Server-only.'};
}

function bookGates(geography){
 const rows=[];
 for(const c of [{classId:'necro',level:15,id:'book_necro_40',owned:true,reason:'book-level'},
  {classId:'assassin',level:15,id:'book_assassin_30',owned:true,reason:'book-level'},
  {classId:'necro',level:40,id:'book_necro_40',owned:false,reason:'book-not-owned'},
  {classId:'mage',level:40,id:'book_necro_40',owned:true,reason:'class-restricted'}]){
  const sim=makeP2Simulation({geography}),p=sim.createCharacter('Gate '+c.level,c.classId);p.level=c.level;p.inventory=c.owned?[{id:c.id,uid:'gate:'+c.id,count:1,plus:0}]:[];sim.recalculate(p);p.hp=p.maxHp;p.mp=p.maxMp;
  const before=p.mp,result=sim.command(p.id,'book-gate-001',{type:'castBook',bookId:c.id});rows.push({...c,result,mpSpent:before-sim.state.characters[p.id].mp});
 }
 return rows;
}
const before=hashes(),geography=makeP2Geography();
const fights=[fight(geography,{classId:'ranger',level:15,targetId:'fire_golem'}),fight(geography,{classId:'necro',level:40,targetId:'rift_boss',bookId:'book_necro_40'})];
const gates=bookGates(geography),hero=referenceHero('ranger',15,3,'live');
const staged=[['MOB-35',58],['MOB-39',66]].map(([id,level])=>{const target=encounterV3(id,level),hit=expectedPlayerHit(hero,target);return {target,hero:{classId:hero.classId,level:hero.level,equipment:hero.equipment,stats:hero.stats},expectedHit:hit,stationaryPotentialTtk:round(target.hp/(hit.damage/hero.profile.attackInterval)),mode:'analytical staged stats only; counter is not implemented in runtime'};});
const report={schema:1,readOnlyProduction:true,sourceHashes:before,sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(hashes()),
 acceptedBook:SKILL_BOOKS.book_necro_40,gates,fights,staged,accuracyExample:resolveAttackAccuracy(80,.5)};
writeFileSync('docs/world-expansion-v3/P2_GOLEM_BOOK_AUDIT.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fights:fights.map(({classId,level,targetId,killed,heroDead,ttk,damageTaken,damageDealt,enemyAttacks,targetHpResets,failure})=>({classId,level,targetId,killed,heroDead,ttk,damageTaken,damageDealt,enemyAttacks,targetHpResets,failure})),gates,staged:staged.map(s=>({mob:s.target.mobId,hp:s.target.hp,ttk:s.stationaryPotentialTtk}))},null,2));
if(report.sourcesChangedDuringRun)process.exitCode=1;
