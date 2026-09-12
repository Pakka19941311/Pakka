import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {p2Encounter} from '../../src/data/p2-encounters.ts';
import {makeP2Geography,makeP2Simulation,equipP2Reference,stepP2} from './p2-combat-smoke.mjs';
import {seededRandom,enduranceDriver} from './p2-endurance.mjs';
import {makeRouteContext} from './p2-quest-routes.mjs';
import {runPlus3Case} from './p2-plus3-economy.mjs';

// Experimental, process-local changes only. This file is never imported by runtime.
// Each isolated fight uses a fresh memory store and one initial reference fixture.
export const CADENCE_CANDIDATES=[
 {id:'baseline',slime:2.3,rat:1.9},
 {id:'weak-atk-minus-1',slime:2.3,rat:1.9,atkDelta:-1},
 ...[2.1,2.3,2.5,2.7,2.9].map(rat=>({id:'rat-'+rat,slime:2.3,rat})),
 ...[.2,.4,.6,.8,.9,1,1.2].map(delta=>({id:'both-plus-'+delta,slime:Number((2.3+delta).toFixed(1)),rat:Number((1.9+delta).toFixed(1))})),
 ...[2.7,3.1].map(slime=>({id:'slime-'+slime,slime,rat:1.9})),
];
const sourceFiles=['src/data/p2-encounters.ts','src/data/encounter-balance-v3.ts','src/core/encounter-combat-v3.ts',
 'src/core/game-rules.ts','src/core/equipment-stats.ts','src/server/world-simulation.ts','src/data/starter-progression-v3.ts'];
const hashSources=()=>Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const sum=values=>values.reduce((a,b)=>a+b,0);

export function withExperimentalCadence(candidate,run){
 const profiles=['MOB-01','MOB-03'].flatMap(canonicalMobId=>[1,2].map(level=>p2Encounter({canonicalMobId,level})));
 const original=profiles.map(p=>structuredClone(p));
 try{
  profiles.forEach((p,i)=>{p.attackInterval=i<2?candidate.slime:candidate.rat;});
  profiles.forEach(p=>{p.atk+=candidate.atkDelta??0;});
  return run();
 }finally{
  profiles.forEach((p,i)=>{p.attackInterval=original[i].attackInterval;p.atk=original[i].atk;
   if(JSON.stringify(p)!==JSON.stringify(original[i]))throw Error('unexpected-profile-mutation');});
 }
}

function isolatedFight(geography,reference,seed){
 const sim=makeP2Simulation({geography,random:seededRandom(seed)});
 const hero=sim.createCharacter('Cadence reference','knight'),target=sim.state.monsters.find(m=>m.uid===reference.uid);
 if(!target||target.level!==2||target.canonicalMobId!==reference.mobId)throw Error('reference-target-drift');
 let standing;
 for(let i=0;i<32;i++){
  const q={x:target.x+Math.cos(i*Math.PI/16)*2.25,z:target.z+Math.sin(i*Math.PI/16)*2.25,spaceId:'surface'};
  if(!geography.safe(q)&&!geography.spaces.surface.collision.isBlocked(q,.46)&&sim.lineOfSight(q,target)){standing=q;break;}
 }
 if(!standing)throw Error('missing-reference-standing-point');
 sim.state.monsters=[target];equipP2Reference(sim,hero,2,3);
 Object.assign(hero,standing,{yaw:Math.atan2(target.x-standing.x,target.z-standing.z)});
 const initialHp=hero.hp,start=sim.state.time,initialMonsterHp=target.hp;
 sim.input(hero.id,1,{type:'attack',entityId:target.uid,skill:null,mode:'auto'});
 while(target.alive&&!hero.dead&&sim.state.time-start<60000)stepP2(sim,100);
 const death=sim.events.find(e=>e.kind==='death'&&e.actor===target.uid);
 const hits=sim.events.filter(e=>e.kind==='hit'&&e.target===hero.id);
 return {uid:target.uid,mobId:target.canonicalMobId,level:2,seed,playerDef:hero.stats.def,initialHp,initialMonsterHp,
  killed:!target.alive,heroDead:hero.dead,damageTaken:initialHp-hero.hp,
  ttk:Number((((death?.at??sim.state.time)-start)/1000).toFixed(3)),
  incomingHits:hits.map(e=>({at:Number(((e.at-start)/1000).toFixed(3)),amount:e.amount})),
  outgoingHits:sim.events.filter(e=>e.kind==='hit'&&e.actor===hero.id&&e.target===target.uid).map(e=>({at:Number(((e.at-start)/1000).toFixed(3)),amount:e.amount})),
  attackInterval:p2Encounter(target).attackInterval,monsterAtk:p2Encounter(target).atk};
}

export function runCadenceCandidates(){
 const geography=makeP2Geography(),before=hashSources();
 const actual=JSON.parse(readFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY.json')).cases.find(c=>c.classId==='knight');
 const rows=[];
 for(const candidate of CADENCE_CANDIDATES){
  const fights=withExperimentalCadence(candidate,()=>actual.battles.map((r,i)=>isolatedFight(geography,r,2201+i)));
  const damageTaken=sum(fights.map(f=>f.damageTaken)),bottles=Math.ceil(damageTaken/37);
  const row={...candidate,scenario:'ten-independent-isolated-fights',fights,damageTaken,
   slimeDamage:sum(fights.filter(f=>f.mobId==='MOB-01').map(f=>f.damageTaken)),
   ratDamage:sum(fights.filter(f=>f.mobId==='MOB-03').map(f=>f.damageTaken)),
   meanTtk:sum(fights.map(f=>f.ttk))/fights.length,
   hypotheticalBottles:bottles,hypotheticalPotionSpend:bottles*55,
   illustrativeRatioWithUnchangedActualGross:bottles*55/actual.grossRealizedGold};
  rows.push(row);console.log(JSON.stringify({id:row.id,damageTaken,rowTtk:row.meanTtk,bottles}));
 }
 const after=hashSources();
 return {schema:'p2-upkeep-candidates-v1',productionBalanceChanged:false,sourceHashes:before,
  sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(after),mapVersion:geography.mapVersion,
  method:'Synthetic isolated actual WorldSimulation fights on the ten recorded UID locations, fresh fixture per fight, same seed per UID across candidates; no route, purchase or sale replay. Seeded RNG calls can diverge with attack count. Potion costs and preserved gross are illustrative arithmetic, not actual transactions.',
  actualReference:{file:'P2_PLUS3_ECONOMY.json',classId:'knight',level:2,plus:3,damageTaken:sum(actual.battles.map(b=>b.damageTaken)),
   gross:actual.grossRealizedGold,mobGold:actual.huntGold,saleRevenue:actual.saleRevenue,potionSpend:actual.repeatRoutePotionSpend,
   actualRatio:actual.actualRepeatRecoveryRatio},rows};
}
export function runCadenceSensitivity(){
 const geography=makeP2Geography(),before=hashSources();
 const actual=JSON.parse(readFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY.json')).cases.find(c=>c.classId==='knight');
 const rows=[];
 for(const id of ['baseline','both-plus-0.9','both-plus-1','both-plus-1.2']){
  const candidate=CADENCE_CANDIDATES.find(c=>c.id===id),batches=[];
  for(const baseSeed of [2301,2401,2501,2601,2701]){
   const fights=withExperimentalCadence(candidate,()=>actual.battles.map((r,i)=>isolatedFight(geography,r,baseSeed+i)));
   const damageTaken=sum(fights.map(f=>f.damageTaken));
   batches.push({baseSeed,damageTaken,bottles:Math.ceil(damageTaken/37),meanTtk:sum(fights.map(f=>f.ttk))/fights.length,
    fights:fights.map(({incomingHits,outgoingHits,...f})=>f)});
  }
  rows.push({...candidate,batches});console.log(JSON.stringify({id,damage:batches.map(b=>b.damageTaken),bottles:batches.map(b=>b.bottles)}));
 }
 return {schema:'p2-upkeep-sensitivity-v1',productionBalanceChanged:false,sourceHashes:before,
  sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(hashSources()),
  method:'Five additional seed batches per candidate, each ten independent isolated fights; potion counts are ceil(total damage / 37), not purchases. This does not establish population/route economy.',rows};
}
export function runContinuousCadence(){
 const context=makeRouteContext(),before=hashSources();
 const actual=JSON.parse(readFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY.json')).cases.find(c=>c.classId==='knight');
 const uids=new Set(actual.battles.map(b=>b.uid)),rows=[];
 for(const id of ['baseline','both-plus-1']){
  const candidate=CADENCE_CANDIDATES.find(c=>c.id===id),cases=[];
  for(const seed of [1101,1107,1113]){
   const recipe={id:'CADENCE-'+id+'-'+seed,classId:'knight',level:2,seed,mobs:['MOB-01','MOB-03'],targetLevel:2};
   const result=withExperimentalCadence(candidate,()=>runPlus3Case(context,recipe,{driverFactory:(ctx,options)=>{
    const d=enduranceDriver(ctx,options);
    // Explicit synthetic population isolation, only once before purchases/movement.
    // Keep original homes, levels, full HP and UID; never reset actors between fights.
    d.sim.state.monsters=d.sim.state.monsters.filter(m=>uids.has(m.uid));
    if(d.sim.state.monsters.length!==10)throw Error('synthetic-target-population-drift');
    return d;
   }}));
   result.method='Synthetic isolated ten-monster population on actual terrain. One initial knight level2 / starter+3 fixture and population filter; unchanged full target HP/UID/levels. Then ordinary movement, ten sequential battles, return/sale/buy/use/restock through live commands. No between-fight resource/HP/position reset; no free HP regeneration. This is not a full-1151-population validation.';
   cases.push(result);console.log(JSON.stringify({candidate:id,seed,damage:sum(result.battles.map(b=>b.damageTaken)),
    gross:result.grossRealizedGold,replenishment:result.repeatRoutePotionSpend,ratio:result.actualRepeatRecoveryRatio}));
  }
  rows.push({...candidate,cases});
 }
 return {schema:'p2-upkeep-continuous-v1',productionBalanceChanged:false,sourceHashes:before,
  sourcesChangedDuringRun:JSON.stringify(before)!==JSON.stringify(hashSources()),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const sensitivity=process.argv.includes('--sensitivity'),continuous=process.argv.includes('--continuous');
 const report=continuous?runContinuousCadence():sensitivity?runCadenceSensitivity():runCadenceCandidates();
 writeFileSync('docs/world-expansion-v3/'+(continuous?'P2_UPKEEP_CONTINUOUS':sensitivity?'P2_UPKEEP_SENSITIVITY':'P2_UPKEEP_CANDIDATES')+'.json',JSON.stringify(report,null,2)+'\n');
 const failed=continuous?report.rows.some(r=>r.cases.some(c=>c.failure||c.recoveryFailure||c.deaths)):
  report.rows.some(r=>(r.fights??r.batches.flatMap(b=>b.fights)).some(f=>!f.killed||f.heroDead));
 if(report.sourcesChangedDuringRun||failed)process.exitCode=1;
}
