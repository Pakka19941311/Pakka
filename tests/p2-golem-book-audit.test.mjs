import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync('docs/world-expansion-v3/P2_GOLEM_BOOK_AUDIT.json'));
test('two ordinary-control traces expose safe legacy kiting without healing, forced damage or resets',()=>{
 assert.equal(report.readOnlyProduction,true);assert.equal(report.sourcesChangedDuringRun,false);assert.equal(report.fights.length,2);
 for(const f of report.fights){
  assert.equal(f.failure,null);assert.equal(f.killed,true);assert.equal(f.heroDead,false);assert.equal(f.damageTaken,0);assert.equal(f.enemyAttacks,0);
  assert.equal(f.initial.targetHp,f.legacyDefinition.hp);assert.equal(f.targetHpResets,0);assert.equal(f.final.hp,f.initial.hp);
  assert.equal(f.loot.length,1);assert.ok(f.walkMetres>100);assert.ok(f.trace.every(t=>t.los));
  assert.ok(Math.max(...f.trace.map(t=>t.homeDistance))<10);assert.equal(f.population,1);
 }
 const ranger=report.fights[0],necro=report.fights[1];
 assert.equal(ranger.level,15);assert.equal(ranger.legacyDefinition.level,20);assert.equal(ranger.outgoingHits.length,26);
 assert.ok(ranger.outgoingHits.every(h=>h.amount===25));assert.equal(ranger.damageDealt,650);
 assert.equal(necro.level,40);assert.equal(necro.legacyDefinition.level,25);assert.equal(necro.cast.ok,true);
 assert.equal(necro.outgoingHits.length,34);assert.ok(necro.outgoingHits.every(h=>h.amount===necro.initial.targetHp*.03));
});
test('book level, class and ownership checks reject before spending MP',()=>{
 assert.equal(report.gates.length,4);
 for(const gate of report.gates){assert.equal(gate.result.ok,false);assert.equal(gate.result.reason,gate.reason);assert.equal(gate.mpSpent,0);}
});
test('level58 ice and level66 fire calculations remain explicitly staged evidence',()=>{
 assert.deepEqual(report.staged.map(s=>[s.target.mobId,s.target.level]),[['MOB-35',58],['MOB-39',66]]);
 for(const s of report.staged){assert.equal(s.target.runtimeEnabled,false);assert.equal(s.hero.level,15);assert.ok(s.stationaryPotentialTtk>35);}
});
