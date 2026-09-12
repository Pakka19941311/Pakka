import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {FinalWorld} from '../../src/world/final-world.ts';
import {referenceHero} from './balance.mjs';
import {makeP2Simulation,stepP2} from './p2-combat-smoke.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {fight} from './p2-golem-book-audit.mjs';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=n=>Number(n.toFixed(3));
export function prepareRangedControl({speciesId='fire_golem',classId='ranger',level=15,bookId,mode='starter-v3',isolated=true,geography}={}){
 geography??=new FinalWorld(undefined,true,{populationMode:mode});
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Response '+classId,classId),ref=referenceHero(classId,level,3,'live');
 Object.assign(p,{level,xp:0,inventory:[],lootBuffer:[],equipment:Object.fromEntries(Object.entries(ref.equipment).map(([s,i])=>[s,{...i,uid:'response:'+i.id,count:1}]))});
 if(bookId)p.inventory.push({id:bookId,uid:'response:'+bookId,count:1,plus:0});sim.recalculate(p);p.hp=p.maxHp;p.mp=p.maxMp;
 let m,point,sidestep;
 for(const candidate of sim.state.monsters.filter(m=>m.id===speciesId&&!m.canonicalMobId)){
  for(let i=0;i<32;i++){
   const angle=i*Math.PI/16,q={spaceId:candidate.spaceId,x:candidate.x+Math.cos(angle)*11,z:candidate.z+Math.sin(angle)*11};
   const side={spaceId:q.spaceId,x:q.x-Math.sin(angle)*3.5,z:q.z+Math.cos(angle)*3.5},collision=geography.space(q).collision;
   if(geography.safe(q)||collision.isBlocked(q,.46)||!sim.lineOfSight(q,candidate)||!pathSegmentIsClear(collision,q,side,.46)||collision.isBlocked(side,.46))continue;
   m=candidate;point=q;sidestep=side;break;
  }if(m)break;
 }
 if(!m)throw Error('no-real-counter-standing-point:'+speciesId);
 if(isolated)sim.state.monsters=[m];Object.assign(p,point,{yaw:Math.atan2(m.x-point.x,m.z-point.z)});sim.heartbeat(p.id);
 let sequence=0,commands=0;const input=intent=>sim.input(p.id,++sequence,intent),advance=ms=>stepP2(sim,ms);
 const command=c=>sim.command(p.id,'response-cmd-'+(++commands),c);
 function startAggression(){
  if(bookId){const result=command({type:'castBook',bookId});if(!result.ok)throw Error(result.reason);}
  else input({type:'attack',entityId:m.uid,skill:null,mode:'single'});
 }
 function waitForAttack(predicate=a=>Boolean(a.counter),maxMs=12000){
  const end=sim.state.time+maxMs;let a;
  while(sim.state.time<end&&m.alive&&!p.dead){a=sim.state.pending.find(a=>a.actor===m.uid&&predicate(a));if(a)return a;advance(50);}
  throw Error('counter-not-started:'+speciesId);
 }
 return {sim,p,m,geography,input,command,advance,startAggression,waitForAttack,point,sidestep};
}
function stationary(speciesId,bookId){
 const f=prepareRangedControl({speciesId,bookId,classId:bookId?'necro':'ranger',level:bookId?40:15}),{sim,p,m}=f;
 const initial={hp:p.hp,mp:p.mp,targetHp:m.hp};f.startAggression();const a=f.waitForAttack();f.input({type:'cancel'});
 const ground=sim.snapshot(p.id).groundEffects.find(e=>e.kind==='line'),before=p.hp;
 f.advance(Math.max(0,a.hitAt-sim.state.time-50));const hpBeforeImpact=p.hp;f.advance(100);
 const events=sim.events.filter(e=>e.actor===m.uid||e.target===m.uid||e.target===p.id);
 return {speciesId,classId:p.classId,level:p.level,targetUid:m.uid,population:sim.state.monsters.length,initial,
  hpBeforeImpact,expectedUnchangedBeforeImpact:before,finalHp:p.hp,attack:a,ground,
  hits:events.filter(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id),releases:events.filter(e=>e.kind==='release'&&e.actor===m.uid),events,
  method:'One initial reference+3 fixture on real terrain; original full-HP target, isolated. Legal single attack or one owned book, cancel and wait. No runtime HP/stat/AI substitutions.'};
}
function sidestep(){
 const f=prepareRangedControl(),{sim,p,m}=f;f.startAggression();const a=f.waitForAttack(),hp=p.hp,endpoint=structuredClone(a.counter.endPoint),start={x:p.x,z:p.z};
 f.input({type:'destination',x:f.sidestep.x,z:f.sidestep.z});f.advance(a.hitAt-sim.state.time+100);
 return {targetUid:m.uid,hpBefore:hp,hpAfter:p.hp,moved:round(gap(start,p)),endpoint,fixedEndpoint:a.counter.endPoint,
  hero:{x:p.x,z:p.z},hits:sim.events.filter(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id),release:sim.events.find(e=>e.kind==='release'&&e.actor===m.uid),method:'Real destination across the fixed telegraphed line; no forced position after initial setup.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const files=['src/server/world-simulation.ts','src/network/world-protocol.ts','src/data/ranged-response-v3.ts','scripts/world_expansion_v3/ranged-response-control.mjs'];
 const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));const before=hashes();
 const stationaryRows=[stationary('fire_golem'),stationary('ice_golem'),stationary('rift_boss','book_necro_40')],dodge=sidestep();
 const g=new FinalWorld(undefined,true,{populationMode:'starter-v3'}),circle=fight(g,{classId:'necro',level:40,targetId:'rift_boss',bookId:'book_necro_40'});
 const report={schema:1,stage:'starter-v3-ranged-candidate',sourceHashes:before,sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(hashes()),stationary:stationaryRows,sidestep:dodge,circle,
  historicalSha256:createHash('sha256').update(readFileSync('docs/world-expansion-v3/P2_GOLEM_BOOK_AUDIT.json')).digest('hex'),
  limits:['Native telegraph/animation not tested here.','Legacy mode and monster stats/loot unchanged.','Sidestep is valid play; circle survival does not invalidate aimed-line.']};
 writeFileSync('docs/world-expansion-v3/RANGED_RESPONSE_CONTROL.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({stationary:stationaryRows.map(r=>({id:r.speciesId,damage:r.initial.hp-r.finalHp,hit:r.hits[0]?.amount,windup:r.attack.hitAt-r.events.find(e=>e.kind==='attack'&&e.actor===r.targetUid)?.at,telegraph:r.ground})),sidestep:{moved:dodge.moved,damage:dodge.hpBefore-dodge.hpAfter},circle:{killed:circle.killed,ttk:circle.ttk,enemyAttacks:circle.enemyAttacks,damageTaken:circle.damageTaken,failure:circle.failure}},null,2));
 if(report.sourcesChangedDuringRun||stationaryRows.some(r=>r.hits.length!==1||r.hpBeforeImpact!==r.expectedUnchangedBeforeImpact)||dodge.hits.length||!dodge.release||circle.failure)process.exitCode=1;
}
