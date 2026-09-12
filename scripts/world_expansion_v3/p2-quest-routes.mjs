import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {makeP2Geography,makeP2Simulation,equipP2Reference,stepP2} from './p2-combat-smoke.mjs';
import {buildAccessGraph} from './access-graph.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function makeRouteContext(){
 const geography=makeP2Geography(),base=geography.spaces.surface.collision,wolves=geography.slots.filter(s=>s.canonicalMobId==='MOB-02');
 const collision={findNearestFree:base.findNearestFree.bind(base),isBlocked:(p,r)=>base.isBlocked(p,r)||
  (!geography.safe({...p,spaceId:'surface'})&&wolves.some(w=>distance(w,p)<8+r+.4))};
 const graph=buildAccessGraph({...geography,spaces:{...geography.spaces,surface:{...geography.spaces.surface,bounds:[-330,-285,40,-35],collision}}},'surface',{step:2});
 return {geography,collision,graph};
}
function pathBetween(context,start,goal){
 const {graph,collision}=context;if(pathSegmentIsClear(collision,start,goal,.46))return [goal];
 let a=graph.nodeFor(start),b=graph.nodeFor(goal);if(a===undefined||b===undefined)throw Error('unreachable-route-endpoint');
 const from=[],to=[],seen=new Map();while(a>=0){seen.set(a,from.length);from.push(a);a=graph.parent[a];}
 while(!seen.has(b)){to.push(b);b=graph.parent[b];if(b<0)throw Error('disconnected-route');}
 const raw=[start,...from.slice(0,seen.get(b)+1).map(graph.point),...to.reverse().map(graph.point),goal],out=[];
 for(let i=0;i<raw.length-1;){let next=i+1;
  for(let j=Math.min(raw.length-1,i+35);j>next;j--)if(pathSegmentIsClear(collision,raw[i],raw[j],.46)){next=j;break;}
  out.push(raw[next]);i=next;
 }return out;
}
function makeDriver(context,{level=1,reference=false}={}){
 const sim=makeP2Simulation({geography:context.geography}),initial=sim.createCharacter('Маршрут P2','knight'),id=initial.id;
 if(reference)equipP2Reference(sim,initial,level);let sequence=0,command=0,walked=0,maxMovementStep=0;
 const log=[],movementTrace=[{at:sim.state.time,x:initial.x,z:initial.z}],p=()=>sim.state.characters[id],input=intent=>sim.input(id,++sequence,intent);
 const send=payload=>{const receipt=sim.command(id,'route-command-'+(++command),payload);if(!receipt.ok)throw Error(receipt.reason);return receipt;};
 const tick=ms=>{const old={x:p().x,z:p().z};stepP2(sim,ms);const moved=distance(old,p());walked+=moved;maxMovementStep=Math.max(maxMovementStep,moved);
  if(sim.state.time-movementTrace.at(-1).at>=1000)movementTrace.push({at:sim.state.time,x:Number(p().x.toFixed(3)),z:Number(p().z.toFixed(3))});
  if(p().dead)throw Error('route-hero-died');};
 const walkSegment=(goal,observe)=>{
  input({type:'destination',x:goal.x,z:goal.z});let remaining=30000;
  while(distance(p(),goal)>.7&&remaining>0){tick(100);remaining-=100;if(observe?.())break;}
  if(remaining<=0)throw Error('route-stuck:'+JSON.stringify({hero:{x:p().x,z:p().z},goal}));
 };
 const walk=(goal,observe)=>{for(const q of pathBetween(context,p(),goal)){walkSegment(q,observe);if(observe?.())break;}input({type:'cancel'});tick(150);};
 const stop=()=>{input({type:'cancel'});tick(350);};
 const approach=m=>{
  const points=[];for(let i=0;i<64;i++){const q={x:m.x+Math.cos(i*Math.PI/32)*2.35,z:m.z+Math.sin(i*Math.PI/32)*2.35,spaceId:'surface'};
   if(!context.geography.safe(q)&&!context.collision.isBlocked(q,.46)&&sim.lineOfSight(q,m)&&context.graph.nodeFor(q)!==undefined)points.push(q);}
  return points.sort((a,b)=>distance(a,p())-distance(b,p()))[0];
 };
 const kill=m=>{
  const q=approach(m);if(!q)throw Error('no-safe-attack-approach:'+m.uid);walk(q);
  const start=sim.state.time,hp=m.hp;input({type:'attack',entityId:m.uid,skill:null,mode:'auto'});let remaining=90000;
  while(m.alive&&remaining>0){tick(100);remaining-=100;}stop();if(m.alive)throw Error('route-combat-timeout');
  log.push({kind:'kill',uid:m.uid,generation:m.generation,mobId:m.canonicalMobId,level:m.level,initialMonsterHp:hp,seconds:(sim.state.time-start)/1000,heroHp:p().hp});
 };
 const killMany=(mobId,count)=>{const used=new Set();for(let i=0;i<count;i++){
  const choices=sim.state.monsters.filter(m=>m.canonicalMobId===mobId&&m.alive&&!used.has(m.uid)&&approach(m)).sort((a,b)=>a.level-b.level||distance(a,p())-distance(b,p()));
  if(!choices.length)throw Error('not-enough-natural-targets:'+mobId);used.add(choices[0].uid);kill(choices[0]);
 }};
 return {sim,p,input,send,tick,walk,walkSegment,stop,killMany,log,movementTrace,get walked(){return walked;},get maxMovementStep(){return maxMovementStep;}};
}
function questRecord(driver,id){return structuredClone(driver.p().starterProgress.quests[id]);}
function accept(driver,id){driver.send({type:'starterQuest',questId:id,action:'accept'});}
function claim(driver,id){const receipt=driver.send({type:'starterQuest',questId:id,action:'claim'});return {record:questRecord(driver,id),receipt};}

function runFirstPair(context){
 const d=makeDriver(context),roen=context.geography.services['npc:elder'];
 // Equip only the genuine initial bag items through ordinary server commands.
 for(const item of [...d.p().inventory].filter(i=>['wardens_blade','militia_plate'].includes(i.id)))d.send({type:'equip',item:{...item}});
 d.walk(roen);accept(d,'QUEST-101');accept(d,'QUEST-103');
 const manifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_POPULATION.json','utf8'));
 const first=manifest.firstQuestSafety.routes.find(r=>context.geography.slotById.get(r.uid).canonicalMobId==='MOB-01');
 const slime=d.sim.state.monsters.find(m=>m.uid===first.uid);
 let viewing;
 for(let i=0;i<64;i++){
  const q={x:slime.x+Math.cos(i*Math.PI/32)*12,z:slime.z+Math.sin(i*Math.PI/32)*12,spaceId:'surface'};
  if(!context.collision.isBlocked(q,.46)&&context.geography.populationLocation(q)==='L02'&&d.sim.lineOfSight(q,slime)&&context.graph.nodeFor(q)!==undefined){viewing=q;break;}
 }
 if(!viewing)throw Error('no-slime-observation-approach');d.walk(viewing);d.tick(1600);
 if(!questRecord(d,'QUEST-101').evidence.includes('outskirts-inspected'))throw Error('live-slime-inspection-not-observed');
 d.killMany('MOB-01',5);d.walk(roen);const firstClaim=claim(d,'QUEST-101');
 // The weak quest weapon is equipped from its actual reward entitlement.
 const weapon=d.p().inventory.find(i=>i.id==='starter_weapon_knight');d.send({type:'equip',item:{...weapon}});
 d.killMany('MOB-03',4);d.walk(roen);const thirdClaim=claim(d,'QUEST-103');
 return {scenario:'fresh-level1-normal-loadout-and-real-quest-reward',initialLevel:1,finalLevel:d.p().level,walkedMetres:Number(d.walked.toFixed(2)),seconds:(d.sim.state.time-1000)/1000,
  quests:{'QUEST-101':firstClaim,'QUEST-103':thirdClaim},combat:d.log,movementTrace:d.movementTrace,maxMovementStep:d.maxMovementStep,heroHp:d.p().hp,population:d.sim.state.monsters.length,fixtureCompletion:false,fixtureLevel:false};
}
function runBoar(context){
 const d=makeDriver(context,{level:3,reference:true}),roen=context.geography.services['npc:elder'];d.walk(roen);accept(d,'QUEST-104');
 const boars=d.sim.state.monsters.filter(m=>m.canonicalMobId==='MOB-04');
 const manifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_POPULATION.json','utf8'));
 const candidate=boars.find(m=>m.regionId===manifest.boarObservation.groupId&&context.graph.nodeFor(m)!==undefined);
 if(!candidate)throw Error('no-boar-route-candidate');
 d.walk(candidate,()=>Boolean(d.p().starterProgress.observation?.boar));
 const observed=d.p().starterProgress.observation?.boar;if(!observed)throw Error('boar-approach-not-observed');
 const center=observed.center,startAngle=Math.atan2(d.p().z-center.z,d.p().x-center.x);
 let route;
 for(const r of [observed.radius+2,observed.radius+4,observed.radius+6,observed.radius+8])for(const direction of [1,-1]){
  if(route)break;
  const arc=Array.from({length:25},(_,i)=>({x:center.x+Math.cos(startAngle+direction*i*Math.PI/45)*r,z:center.z+Math.sin(startAngle+direction*i*Math.PI/45)*r,spaceId:'surface'}));
  const prefix=[{x:d.p().x,z:d.p().z},...arc];
  if(!prefix.every(q=>context.geography.populationLocation(q)==='L02')||!prefix.slice(1).every((q,i)=>pathSegmentIsClear(context.collision,prefix[i],q,.46)))continue;
  for(let k=0;k<32;k++){
   const endAngle=startAngle+direction*24*Math.PI/45+k*Math.PI/16;
   const retreat={x:center.x+Math.cos(endAngle)*(observed.radius+27),z:center.z+Math.sin(endAngle)*(observed.radius+27),spaceId:'surface'};
   if(context.collision.isBlocked(retreat,.46)||context.geography.populationLocation(retreat)!=='L02')continue;
   let tail;try{tail=pathBetween(context,arc.at(-1),retreat);}catch{continue;}
   const innerCollision={isBlocked:(p,radius)=>context.collision.isBlocked(p,radius)||distance(p,center)<observed.radius+.6};
   const combined=[arc.at(-1),...tail];
   if(combined.slice(1).every((q,i)=>pathSegmentIsClear(innerCollision,combined[i],q,.46))){route={groupId:observed.groupId,center,r,points:[...arc,...tail]};break;}
  }
 }
 if(!route)throw Error('no-clear-boar-quarter-circle:'+JSON.stringify({center,radius:observed.radius,startAngle}));
 for(const q of route.points)d.walkSegment(q);d.stop();
 if(!questRecord(d,'QUEST-104').evidence.includes('boar-retreat'))throw Error('live-boar-route-not-observed:'+JSON.stringify(questRecord(d,'QUEST-104')));
 d.killMany('MOB-04',4);d.walk(roen);const reward=claim(d,'QUEST-104');
 return {scenario:'level3-starter-reference-real-route',initialLevel:3,finalLevel:d.p().level,walkedMetres:Number(d.walked.toFixed(2)),seconds:(d.sim.state.time-1000)/1000,
  quests:{'QUEST-104':reward},route,combat:d.log,movementTrace:d.movementTrace,maxMovementStep:d.maxMovementStep,heroHp:d.p().hp,population:d.sim.state.monsters.length,fixtureCompletion:false,fixtureLevel:true};
}
function runBeetles(context){
 const d=makeDriver(context,{level:7,reference:true}),roen=context.geography.services['npc:elder'];d.walk(roen);accept(d,'QUEST-105');
 d.killMany('MOB-05',6);const beforeReturn=questRecord(d,'QUEST-105');d.walk(roen);const reward=claim(d,'QUEST-105');
 return {scenario:'level7-starter-reference-real-city-return',initialLevel:7,finalLevel:d.p().level,walkedMetres:Number(d.walked.toFixed(2)),seconds:(d.sim.state.time-1000)/1000,
  beforeReturn,quests:{'QUEST-105':reward},combat:d.log,movementTrace:d.movementTrace,maxMovementStep:d.maxMovementStep,heroHp:d.p().hp,population:d.sim.state.monsters.length,fixtureCompletion:false,fixtureLevel:true};
}
export function runQuestRoutes({only}={}){
 const context=makeRouteContext(),results=[];
 for(const [name,run]of [['QUEST-101+103',runFirstPair],['QUEST-104',runBoar],['QUEST-105',runBeetles]]){
  if(only&&name!==only)continue;
  try{const result=run(context);results.push({name,ok:true,...result});console.log(JSON.stringify({name,ok:true,walkedMetres:result.walkedMetres,seconds:result.seconds}));}
  catch(error){results.push({name,ok:false,error:String(error)});console.log(JSON.stringify(results.at(-1)));}
 }
 const sources=['scripts/world_expansion_v3/p2-quest-routes.mjs','scripts/world_expansion_v3/p2-combat-smoke.mjs','src/server/world-simulation.ts','src/world/final-world.ts','src/data/p2-starter-population-v3.ts','src/core/starter-quest-observation.ts','src/data/starter-progression-v3.ts'];
 return {schema:1,populationVersion:context.geography.populationPlan.version,digest:context.geography.populationPlan.digest,
  sourceHashes:sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),
  method:'Actual WorldSimulation at normal xpRate1. Real destination/attack/equip/accept/claim commands; no teleports, no direct evidence/kill/HP injection. Full1151 population. Fixed RNG0.5. Level3/7 reference setup explicitly marked.',results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7),report=runQuestRoutes({only});
 writeFileSync('docs/world-expansion-v3/P2_QUEST_ROUTES'+(only?'-'+only:'')+'.json',JSON.stringify(report,null,2)+'\n');
 if(report.results.some(r=>!r.ok))process.exitCode=1;
}
