import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRouteContext} from './p2-quest-routes.mjs';
import {makeP2Simulation,equipP2Reference,stepP2} from './p2-combat-smoke.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {p2Encounter} from '../../src/data/p2-encounters.ts';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),rounded=n=>Number(n.toFixed(3));
export function seededRandom(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function pathBetween({graph,collision},start,goal){
 if(pathSegmentIsClear(collision,start,goal,.46))return [goal];
 let a=graph.nodeFor(start),b=graph.nodeFor(goal);if(a===undefined||b===undefined)throw Error('endurance-no-path');
 const from=[],to=[],seen=new Map();while(a>=0){seen.set(a,from.length);from.push(a);a=graph.parent[a];}
 while(!seen.has(b)){to.push(b);b=graph.parent[b];if(b<0)throw Error('endurance-disconnected');}
 const raw=[start,...from.slice(0,seen.get(b)+1).map(graph.point),...to.reverse().map(graph.point),goal],out=[];
 for(let i=0;i<raw.length-1;){let next=i+1;for(let j=Math.min(raw.length-1,i+35);j>next;j--)if(pathSegmentIsClear(collision,raw[i],raw[j],.46)){next=j;break;}out.push(raw[next]);i=next;}
 return out;
}
export function enduranceDriver(context,{classId,level,seed=11,plus=0}={}){
 const sim=makeP2Simulation({geography:context.geography,random:seededRandom(seed)}),initial=sim.createCharacter('Серия '+classId,classId),id=initial.id;
 // The only administrative setup: level and reference gear, once, at the real spawn.
 equipP2Reference(sim,initial,level,plus);let seq=0,commandId=0,cursor=0,walked=0,nextHealAt=0;
 const events=[],purchases=[],healing=[],trace=[],p=()=>sim.state.characters[id];
 const capture=()=>{for(const e of sim.events)if(e.sequence>cursor)events.push(structuredClone(e));cursor=sim.state.sequence;};
 const input=intent=>sim.input(id,++seq,intent);
 const command=payload=>{const receipt=sim.command(id,'endurance-'+(++commandId),payload);capture();if(!receipt.ok)throw Error(receipt.reason);return receipt;};
 const tick=(ms,{allowDeath=false}={})=>{const before={x:p().x,z:p().z};stepP2(sim,ms);capture();walked+=dist(before,p());
  if(!trace.length||sim.state.time-trace.at(-1).at>=1000)trace.push({at:sim.state.time,x:rounded(p().x),z:rounded(p().z),hp:p().hp,gold:p().gold,level:p().level});
  if(p().dead&&!allowDeath)throw Error('endurance-hero-died');};
 const snapshot=()=>({at:sim.state.time,level:p().level,xp:p().xp,hp:p().hp,maxHp:p().maxHp,mp:p().mp,gold:p().gold,dead:p().dead,
  potions:p().inventory.filter(i=>['potion','potion_large'].includes(i.id)).map(i=>({id:i.id,count:i.count}))});
 const stop=()=>{input({type:'cancel'});tick(350);};
 const walkSegment=q=>{input({type:'destination',x:q.x,z:q.z});let budget=30000;
  while(dist(p(),q)>.7&&budget>0){tick(100);budget-=100;}if(budget<=0)throw Error('endurance-stuck:'+JSON.stringify({x:p().x,z:p().z,goal:q}));};
 const walk=goal=>{
  // A real wolf fight finishes inside its former perception circle. Walk back
  // out through physical geometry before rejoining the conservative approach graph.
  if(context.graph.nodeFor(p())===undefined){
   const exits=[];for(const radius of [3,6,9,12,15,18])for(let i=0;i<32;i++){
    const q={x:p().x+Math.cos(i*Math.PI/16)*radius,z:p().z+Math.sin(i*Math.PI/16)*radius,spaceId:'surface'};
    if(context.graph.nodeFor(q)!==undefined&&pathSegmentIsClear(context.geography.spaces.surface.collision,p(),q,.46))exits.push(q);
   }
   exits.sort((a,b)=>dist(a,p())+dist(a,goal)-dist(b,p())-dist(b,goal));if(!exits.length)throw Error('endurance-no-physical-egress');walkSegment(exits[0]);
  }
  for(const q of pathBetween(context,p(),goal))walkSegment(q);stop();
 };
 const buy=id=>{const before=p().gold;command({type:'buy',itemId:id});purchases.push({at:sim.state.time,id,cost:before-p().gold});};
 const heal=()=>{const item=p().inventory.find(i=>i.id==='potion')??p().inventory.find(i=>i.id==='potion_large');if(!item||p().hp>=p().maxHp)return false;
  const before=p().hp;command({type:'use',item:{...item}});healing.push({at:sim.state.time,id:item.id,hp:rounded(p().hp-before),replacementCost:item.id==='potion'?55:110});return true;};
 const emergencyHeal=()=>{if(p().hp<p().maxHp*.4&&sim.state.time>=nextHealAt){if(heal())nextHealAt=sim.state.time+1500;}};
 const approach=(m,{wolfEntry=false}={})=>{
  const distance=wolfEntry?10.5:['knight','assassin'].includes(classId)?2.35:6,points=[];
  for(let i=0;i<64;i++){const q={x:m.x+Math.cos(i*Math.PI/32)*distance,z:m.z+Math.sin(i*Math.PI/32)*distance,spaceId:'surface'};
   if(!context.geography.safe(q)&&!context.collision.isBlocked(q,.46)&&sim.lineOfSight(q,m)&&context.graph.nodeFor(q)!==undefined&&
    pathSegmentIsClear(context.geography.spaces.surface.collision,q,m,.46))points.push(q);}
  return points.sort((a,b)=>dist(a,p())-dist(b,p()))[0];
 };
 const fight=m=>{
  const before=snapshot(),initialMonsterHp=m.hp,eventStart=sim.state.sequence;
  input({type:'attack',entityId:m.uid,skill:null,mode:'auto'});let remaining=120000;
  while(m.alive&&!p().dead&&remaining>0){tick(100,{allowDeath:true});if(!p().dead)emergencyHeal();remaining-=100;}
  if(!p().dead)stop();const during=events.filter(e=>e.sequence>eventStart),loot=during.filter(e=>e.kind==='loot'&&e.target===m.uid);
  return {uid:m.uid,generation:m.generation,mobId:m.canonicalMobId,targetLevel:m.level,initialMonsterHp,expectedMaxHp:p2Encounter(m).hp,
   before,after:snapshot(),killed:!m.alive,seconds:rounded((sim.state.time-before.at)/1000),
   damageTaken:during.filter(e=>e.kind==='hit'&&e.target===id).reduce((n,e)=>n+e.amount,0),
   attackerUids:[...new Set(during.filter(e=>e.kind==='hit'&&e.target===id).map(e=>e.actor))],loot};
 };
 return {sim,p,id,input,command,tick,snapshot,stop,walk,walkSegment,buy,heal,approach,fight,events,purchases,healing,trace,get walked(){return walked;}};
}
export const ENDURANCE_CASES=[
 {id:'END-01',classId:'knight',level:2,seed:1101,mobs:['MOB-01','MOB-03'],targetLevel:2},
 {id:'END-02',classId:'mage',level:3,seed:1102,mobs:['MOB-03','MOB-01'],targetLevel:3},
 {id:'END-03',classId:'ranger',level:8,seed:1103,mobs:['MOB-05'],targetLevel:8},
 {id:'END-04',classId:'assassin',level:5,seed:1104,mobs:['MOB-04'],targetLevel:5},
 {id:'END-05',classId:'necro',level:8,seed:1105,mobs:['MOB-05'],targetLevel:8},
 {id:'END-06',classId:'knight',level:5,seed:1106,mobs:['MOB-02'],targetLevel:5,quest:'QUEST-102'},
];
export function runEnduranceCase(context,recipe){
 const d=enduranceDriver(context,recipe),initial=d.snapshot(),battles=[],used=new Set(),quest={};let failure=null;
 try{
  d.walk(context.geography.services['npc:shop']);for(let i=0;i<3;i++)d.buy('potion');
  if(recipe.quest){d.walk(context.geography.services['npc:elder']);quest.accept=d.command({type:'starterQuest',questId:recipe.quest,action:'accept'});}
  for(let i=0;i<10;i++){
   const mobId=recipe.mobs[i%recipe.mobs.length];
   const engaged=d.sim.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId&&!used.has(m.uid)&&(m.targetId===d.id||m.provokedBy===d.id));
   const options=engaged.length?engaged:d.sim.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId&&!used.has(m.uid)&&d.approach(m,{wolfEntry:mobId==='MOB-02'}));
   options.sort((a,b)=>Math.abs(a.level-recipe.targetLevel)-Math.abs(b.level-recipe.targetLevel)||dist(a,d.p())-dist(b,d.p()));
   const m=options[0];if(!m)throw Error('endurance-targets-exhausted:'+mobId);
   if(!engaged.length)d.walk(d.approach(m,{wolfEntry:mobId==='MOB-02'}));
   used.add(m.uid);const result=d.fight(m);battles.push(result);console.log(JSON.stringify({case:recipe.id,fight:i+1,hp:d.p().hp,gold:d.p().gold,killed:result.killed}));
   if(!result.killed||d.p().dead)throw Error(d.p().dead?'endurance-hero-died':'endurance-combat-timeout');
  }
 }catch(error){failure=String(error);}
 const afterHunt=d.snapshot(),ordinaryGold=d.events.filter(e=>e.kind==='loot'&&e.actor===d.id).reduce((n,e)=>n+(e.gold??0),0),ordinaryXp=d.events.filter(e=>e.kind==='loot'&&e.actor===d.id).reduce((n,e)=>n+(e.xp??0),0);
 const questBeforeReturn=recipe.quest?structuredClone(d.p().starterProgress.quests[recipe.quest]):null;
 let recoveryFailure=null,saleRevenue=0;const sales=[];
 if(!d.p().dead)try{
  d.walk(context.geography.services['npc:shop']);
  while(d.p().hp<d.p().maxHp){if(!d.heal()){if(d.p().gold<55)break;d.buy('potion');}d.tick(1500);}
  if(recipe.quest&&battles.length===10){d.walk(context.geography.services['npc:elder']);quest.claim=d.command({type:'starterQuest',questId:recipe.quest,action:'claim'});quest.record=structuredClone(d.p().starterProgress.quests[recipe.quest]);}
 }catch(error){recoveryFailure=String(error);}
 const beforeSale=d.snapshot();
 if(!d.p().dead)try{
  d.walk(context.geography.services['npc:smith']);const trade=d.command({type:'tradeOpen',npcId:'npc:smith'}).outcome;
  for(const item of [...d.p().inventory].filter(i=>!['potion','potion_large','ether','haste','teleport'].includes(i.id)&&!i.id.startsWith('starter_')&&!i.id.startsWith('book_'))){
   const before=d.p().gold;d.command({type:'sell',item:{...item},quantity:item.count,trade:{npcId:trade.npcId,token:trade.token}});
   const gold=d.p().gold-before;saleRevenue+=gold;sales.push({id:item.id,count:item.count,gold});
  }
 }catch(error){recoveryFailure??=String(error);}
 const final=d.snapshot(),spent=d.purchases.reduce((n,p)=>n+p.cost,0),replacementCost=d.healing.reduce((n,h)=>n+h.replacementCost,0);
 return {...recipe,population:d.sim.state.monsters.length,initial,afterHunt,beforeSale,final,battles,quest,questBeforeReturn,
  failure,recoveryFailure,deaths:d.events.filter(e=>e.kind==='death'&&e.actor===d.id).length,
  walkedMetres:rounded(d.walked),elapsedSeconds:rounded((d.sim.state.time-initial.at)/1000),ordinaryGold,ordinaryXp,
  potionPurchases:d.purchases,healing:d.healing,potionSpend:spent,consumedHealingReplacementCost:replacementCost,
  recoveryComplete:final.hp===final.maxHp,cashNetBeforeSale:beforeSale.gold-initial.gold,cashNetAfterSale:final.gold-initial.gold,
  fullRecoveryCostRatio:ordinaryGold?replacementCost/ordinaryGold:null,saleRevenue,sales,
  movementTrace:d.trace,method:'One initial +0 reference fixture at real spawn; normal xpRate1; seeded live rolls; no state reset between ten battles; real potion buy/use and optional material sale.'};
}
export function runEndurance({only}={}){
 const context=makeRouteContext(),sources=['scripts/world_expansion_v3/p2-endurance.mjs','scripts/world_expansion_v3/p2-quest-routes.mjs','scripts/world_expansion_v3/p2-combat-smoke.mjs','src/server/world-simulation.ts','src/data/p2-encounters.ts','src/data/p2-starter-population-v3.ts','src/core/game-rules.ts','src/core/equipment-stats.ts'];
 const hashes=()=>sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),sourceHashes=hashes();
 const cases=ENDURANCE_CASES.filter(c=>!only||c.id===only).map(recipe=>runEnduranceCase(context,recipe));
 return {schema:1,populationVersion:context.geography.populationPlan.version,digest:context.geography.populationPlan.digest,sourceHashes,
  sourcesChangedDuringRun:JSON.stringify(hashes())!==JSON.stringify(sourceHashes),cases};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7),report=runEndurance({only});
 writeFileSync('docs/world-expansion-v3/P2_ENDURANCE'+(only?'-'+only:'')+'.json',JSON.stringify(report,null,2)+'\n');
 if(report.sourcesChangedDuringRun||report.cases.some(c=>c.failure))process.exitCode=1;
}
