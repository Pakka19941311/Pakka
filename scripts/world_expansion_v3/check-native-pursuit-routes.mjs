import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeP2Geography,makeP2Simulation,stepP2} from './p2-combat-smoke.mjs';
import {prepareNativePursuitFixture,PURSUIT_MOBS} from './p2-native-pursuit-fixture.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const deltaAngle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

/** Server-only route preflight. Native acceptance remains a separate real client
 * run; this report cannot establish animation, ground contact or rendering. */
export function preflightNativePursuitRoutes(){
 const sources=['scripts/world_expansion_v3/p2-native-pursuit-fixture.mjs','scripts/world_expansion_v3/check-native-pursuit-routes.mjs','src/data/p2-encounters.ts','src/server/world-simulation.ts'];
 const hashes=()=>sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),sourceHashes=hashes();
 const geography=makeP2Geography(),results=[];
 for(const mobId of PURSUIT_MOBS){
  const sim=makeP2Simulation({geography}),hero=sim.createCharacter('Проверка траектории','knight');
  const populationBefore=JSON.stringify(sim.state.monsters),slotBefore=JSON.stringify(geography.slots);
  const fixture=prepareNativePursuitFixture(sim,geography,hero,mobId),target=sim.state.monsters.find(m=>m.uid===fixture.target);
  assert.equal(JSON.stringify(sim.state.monsters),populationBefore,'fixture may not mutate a monster');
  assert.equal(JSON.stringify(geography.slots),slotBefore,'fixture may not mutate slots or leash');
  let sequence=0;const input=intent=>sim.input(hero.id,++sequence,intent),tick=ms=>stepP2(sim,ms);
  input({type:'attack',entityId:target.uid,skill:null,mode:'single'});
  let budget=12000;while(target.hp===fixture.monsterHpBefore&&budget>0){tick(100);budget-=100;}
  assert.ok(target.alive&&target.hp<fixture.monsterHpBefore&&target.provokedBy===hero.id,'ordinary single hit must provoke living target');
  const hitHp=target.hp,start=sim.state.time;let walked=0,prior={...target},stage='orbit',nextCommand=0,sawReturn=false,peakHome=0,peakHeroHome=0,longest=0,segment=0,stall=0;
  const trace=[];
  while(sim.state.time-start<90000&&!hero.dead&&target.alive){
   if(stage==='orbit'&&sim.state.time>=nextCommand){
    const angle=distance(target,fixture.home)>.8?Math.atan2(target.z-fixture.home.z,target.x-fixture.home.x):fixture.angle;
    const lead=angle+.82;let goal={x:fixture.home.x+Math.cos(lead)*fixture.radius,z:fixture.home.z+Math.sin(lead)*fixture.radius};
    if(walked>=fixture.minimumContinuousMetres+1){
     const heroAngle=Math.atan2(hero.z-fixture.home.z,hero.x-fixture.home.x),route=fixture.escapeRoutes.find(r=>Math.abs(deltaAngle(heroAngle,r.angle))<.22);
     if(route){goal=route.escape;stage='escape';}
    }
    input({type:'destination',x:goal.x,z:goal.z});nextCommand=sim.state.time+300;
   }
   tick(150);const moved=distance(target,prior),state=sim.snapshot(hero.id).monsters.find(m=>m.uid===target.uid).aiState;
   if(target.targetId===hero.id)walked+=moved;
   if(['chase','aggro'].includes(state)&&moved/.15>fixture.movementSpeed*.45){segment+=moved;stall=0;longest=Math.max(longest,segment);}else{stall+=.15;if(stall>.6)segment=0;}
   peakHome=Math.max(peakHome,distance(target,fixture.home));peakHeroHome=Math.max(peakHeroHome,distance(hero,fixture.home));sawReturn||=['return','leash'].includes(state);
   trace.push({at:sim.state.time,state,stage,x:target.x,z:target.z,heroX:hero.x,heroZ:hero.z,hp:target.hp,targetId:target.targetId??null});prior={...target};
   if(sawReturn&&distance(target,fixture.home)<=.7&&!target.targetId&&!target.provokedBy)break;
  }
  input({type:'cancel'});
  const checks={fixturePreservesAllMonsters:true,fixturePreservesSlots:true,oneRealHit:target.hp===hitHp,continuous12m:longest>=fixture.minimumContinuousMetres,
   reachedOriginalLeashThenLeft:peakHeroHome>fixture.leashRadius+2&&peakHome>=fixture.leashRadius-fixture.movementSpeed*.3,returnedHome:sawReturn&&distance(target,fixture.home)<=.7&&!target.targetId&&!target.provokedBy,heroSurvived:!hero.dead};
  results.push({mobId,fixture,checks,longestContinuousMetres:longest,peakHomeDistance:peakHome,peakHeroHomeDistance:peakHeroHome,elapsedSeconds:(sim.state.time-start)/1000,trace});
  console.log(JSON.stringify({mobId,checks,longest,peakHome,seconds:(sim.state.time-start)/1000}));
 }
 const sourcesChangedDuringRun=JSON.stringify(sourceHashes)!==JSON.stringify(hashes());
 return {schema:1,scope:'server-route-preflight-not-native-rendering',ok:!sourcesChangedDuringRun&&results.every(r=>Object.values(r.checks).every(Boolean)),
  sourceHashes,sourcesChangedDuringRun,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const output=resolve(process.argv[2]??'work/qa/p2-native-pursuit-preflight.json'),report=preflightNativePursuitRoutes();
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 if(!report.ok)process.exitCode=1;
}
