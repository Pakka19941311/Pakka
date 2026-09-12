import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRouteContext} from './p2-quest-routes.mjs';
import {enduranceDriver} from './p2-endurance.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {p2Encounter,P2_MOVEMENT_V3} from '../../src/data/p2-encounters.ts';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function runPursuitCase(context,mobId,level){
 const d=enduranceDriver(context,{classId:'mage',level,seed:201+Number(mobId.slice(4))}),base=context.geography.spaces.surface.collision;
 let target,standing,retreat;
 for(const m of d.sim.state.monsters.filter(m=>m.canonicalMobId===mobId&&m.level===level)){
  for(let i=0;i<48;i++){
   const u={x:Math.cos(i*Math.PI/24),z:Math.sin(i*Math.PI/24)};
   const a={x:m.home.x+u.x*6,z:m.home.z+u.z*6,spaceId:'surface'},b={x:m.home.x+u.x*26,z:m.home.z+u.z*26,spaceId:'surface'};
   if(context.graph.nodeFor(a)===undefined||!d.sim.lineOfSight(a,m)||!pathSegmentIsClear(context.collision,a,b,.46)||!pathSegmentIsClear(base,m,a,.46))continue;
   if(Array.from({length:41},(_,i)=>({x:a.x+(b.x-a.x)*i/40,z:a.z+(b.z-a.z)*i/40})).some(p=>context.geography.safe(p)))continue;
   target=m;standing=a;retreat=b;break;
  }if(target)break;
 }
 if(!target)throw Error('no-open-pursuit-corridor:'+mobId);
 d.walk(standing);d.tick(2200);const beforeHit={hp:target.hp,targetId:target.targetId??null,provokedBy:target.provokedBy??null};
 d.input({type:'attack',entityId:target.uid,skill:null,mode:'single'});let budget=5000;
 while(target.hp===beforeHit.hp&&budget>0){d.tick(100);budget-=100;}
 if(target.hp===beforeHit.hp)throw Error('pursuit-single-shot-missed');d.stop();
 const hpAfterHit=target.hp,provokedBy=target.provokedBy,trace=[];let peakSpeed=0,maximumHomeDistance=distance(target,target.home),last={x:target.x,z:target.z};
 d.input({type:'destination',x:retreat.x,z:retreat.z});
 for(let i=0;i<380;i++){
  d.tick(100);const moved=distance(target,last);peakSpeed=Math.max(peakSpeed,moved/.1);last={x:target.x,z:target.z};
  maximumHomeDistance=Math.max(maximumHomeDistance,distance(target,target.home));
  if(i%5===0)trace.push({at:d.sim.state.time,x:target.x,z:target.z,hp:target.hp,homeDistance:distance(target,target.home),targetId:target.targetId??null});
  if(i>100&&distance(target,target.home)<.6&&!target.targetId&&!target.provokedBy)break;
 }
 d.stop();
 return {mobId,level,uid:target.uid,definitionSpeed:p2Encounter(target).movementSpeed,locomotionVersion:p2Encounter(target).locomotionVersion,
  beforeHit,hpAfterHit,provokedBy,heroId:d.id,remainingHp:target.hp,peakSpeed,maximumHomeDistance,
  returnedHome:distance(target,target.home)<.6,targetReleased:!target.targetId&&!target.provokedBy,
  playerDamageTaken:d.events.filter(e=>e.kind==='hit'&&e.target===d.id).reduce((n,e)=>n+e.amount,0),
  population:d.sim.state.monsters.length,standing,retreat,trace,
  method:'Real mage single hit, then real destination movement and waiting through pursue/leash/return. No position/HP injection after initial reference setup; no continuous damage or special invulnerability.'};
}
export function runPursuit(){
 const context=makeRouteContext(),sources=['scripts/world_expansion_v3/p2-pursuit.mjs','scripts/world_expansion_v3/p2-endurance.mjs','src/data/p2-encounters.ts','src/server/world-simulation.ts'];
 const hash=()=>sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),sourceHashes=hash(),cases=[];
 for(const [id,level]of [['MOB-01',2],['MOB-03',2],['MOB-05',8]]){
  try{const result=runPursuitCase(context,id,level);cases.push({ok:true,...result});console.log(JSON.stringify({mobId:id,returned:result.returnedHome,peakSpeed:result.peakSpeed}));}
  catch(error){cases.push({mobId:id,ok:false,error:String(error)});console.log(JSON.stringify(cases.at(-1)));}
 }
 return {schema:1,movement:P2_MOVEMENT_V3,sourceHashes,sourcesChangedDuringRun:JSON.stringify(sourceHashes)!==JSON.stringify(hash()),cases};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=runPursuit();writeFileSync('docs/world-expansion-v3/P2_PURSUIT.json',JSON.stringify(report,null,2)+'\n');
 if(report.sourcesChangedDuringRun||report.cases.some(c=>!c.ok||!c.returnedHome||!c.targetReleased))process.exitCode=1;
}
