import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P2_STAGED_POPULATION_META} from '../src/data/p2-starter-population-v3.ts';
import {STARTER_QUESTS} from '../src/data/starter-progression-v3.ts';
import {p2Encounter} from '../src/data/p2-encounters.ts';
const report=JSON.parse(readFileSync('docs/world-expansion-v3/P2_QUEST_ROUTES.json','utf8'));
const history=JSON.parse(readFileSync('docs/world-expansion-v3/P2_EVIDENCE_HISTORY.json','utf8'));
test('historical real quest routes retain population provenance and unchanged objective inputs',()=>{
 assert.equal(report.populationVersion,P2_STAGED_POPULATION_META.version);assert.equal(report.digest,P2_STAGED_POPULATION_META.digest);
 assert.equal(report.results.length,3);assert.ok(report.results.every(r=>r.ok));
 assert.ok(report.sourceHashes.length>=7);
 // This is the recorded habitat-v2 run, before the separately tested P2
 // locomotion and one-house city sample. Do not call it a rerun of later code.
 // Later runtime/geometry revisions have their own checks; objective inputs
 // and population remain bound to this evidence without replaying all routes.
 for(const source of report.sourceHashes){
  assert.match(source.sha256,/^[a-f0-9]{64}$/);
  if(['src/server/world-simulation.ts','src/world/final-world.ts'].includes(source.path))continue;
  const archive=history.archives.find(a=>a.path===source.path);
  assert.equal(createHash('sha256').update(readFileSync(archive?.archive??source.path)).digest('hex'),source.sha256,source.path);
 }
});
test('all four objectives were claimed after real deaths and continuous walking, with level fixtures disclosed',()=>{
 const first=report.results.find(r=>r.name==='QUEST-101+103');assert.equal(first.fixtureLevel,false);assert.equal(first.initialLevel,1);assert.equal(first.finalLevel,2);
 const fourth=report.results.find(r=>r.name==='QUEST-104'),fifth=report.results.find(r=>r.name==='QUEST-105');
 assert.equal(fourth.fixtureLevel,true);assert.equal(fourth.initialLevel,3);assert.equal(fifth.fixtureLevel,true);assert.equal(fifth.initialLevel,7);
 assert.equal(fifth.beforeReturn.kills,6);assert.ok(!fifth.beforeReturn.evidence.includes('returned-to-city'));
 let total=0;
 for(const result of report.results){
  assert.equal(result.fixtureCompletion,false);assert.equal(result.population,1151);assert.ok(result.heroHp>0);
  assert.ok(result.walkedMetres>500);assert.ok(result.maxMovementStep<1);assert.ok(result.movementTrace.length>100);
  assert.equal(result.movementTrace[0].x,-100);assert.equal(result.movementTrace[0].z,-190);
  assert.equal(new Set(result.combat.map(k=>k.uid+':'+k.generation)).size,result.combat.length);
  for(const kill of result.combat){assert.equal(kill.initialMonsterHp,p2Encounter({canonicalMobId:kill.mobId,level:kill.level}).hp);assert.ok(kill.seconds>2);assert.ok(kill.heroHp>0);}total+=result.combat.length;
  for(const [id,reward]of Object.entries(result.quests)){
   const definition=STARTER_QUESTS.find(q=>q.id===id);assert.equal(reward.record.status,'claimed');assert.equal(reward.record.kills,definition.killCount);
   for(const evidence of definition.evidence)assert.ok(reward.record.evidence.includes(evidence),id+':'+evidence);
   assert.equal(reward.receipt.ok,true);assert.equal(reward.receipt.outcome.xpAwarded,definition.xp);assert.ok(reward.receipt.outcome.items.length>0);
  }
 }
 assert.equal(total,19);
});
