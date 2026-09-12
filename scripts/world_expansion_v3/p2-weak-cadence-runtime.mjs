import {writeFileSync} from 'node:fs';
import {runPlus3Economy} from './p2-plus3-economy.mjs';
import {runP2Battle,makeP2Geography} from './p2-combat-smoke.mjs';
import {P2_WEAK_CADENCE_V3,P2_BALANCE_VERSION} from '../../src/data/p2-encounters.ts';
const report=runPlus3Economy({only:'knight'}),geography=makeP2Geography(),level1=[];
for(const classId of ['knight','mage','ranger','assassin','necro'])for(const mobId of ['MOB-01','MOB-03']){
 const result=runP2Battle({geography,classId,mobId,level:1,plus:0});level1.push(result);
 console.log(JSON.stringify({smoke:'level1',classId,mobId,ttk:result.ttk,damageTaken:result.damageTaken,killed:result.killed}));
}
const output={...report,balanceVersion:P2_BALANCE_VERSION,override:P2_WEAK_CADENCE_V3,
 scope:'One full1151 knight2 starter+3 route with actual commerce; ten isolated level1 starter+0 ordinary-intent smoke fights, all five classes, full authored HP.',
 affectedSlots:geography.slots.filter(s=>s.canonicalMobId&&['MOB-01','MOB-03'].includes(s.canonicalMobId)&&s.level<=2).length,level1};
writeFileSync('docs/world-expansion-v3/P2_WEAK_CADENCE_RUNTIME.json',JSON.stringify(output,null,2)+'\n');
if(report.sourcesChangedDuringRun||report.cases.some(c=>c.failure||c.recoveryFailure||!c.repeatRouteWithin40)||level1.some(c=>!c.killed||c.heroDead))process.exitCode=1;
