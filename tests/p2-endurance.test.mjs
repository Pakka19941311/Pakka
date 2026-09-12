import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {p2Encounter,P2_MOVEMENT_V3} from '../src/data/p2-encounters.ts';
import {encounterV3} from '../src/data/encounter-balance-v3.ts';
import {enduranceLedger} from '../scripts/world_expansion_v3/p2-endurance-report.mjs';
const report=JSON.parse(readFileSync('docs/world-expansion-v3/P2_ENDURANCE.json'));
test('accepted locomotion is canonical-only and does not rebalance combat statistics',()=>{
 assert.equal(P2_MOVEMENT_V3.version,'p2-locomotion-v3-2');assert.equal(p2Encounter({id:'spider'}),null);
 for(const [id,level,speed,override]of [['MOB-01',2,1.5,true],['MOB-03',2,1.9,true],['MOB-05',8,1.6,true],['MOB-02',5,4.7,false],['MOB-04',5,4.7,false]]){
  const e=p2Encounter({canonicalMobId:id,level}),base=encounterV3(id,level);
  assert.equal(e.movementSpeed,speed);assert.equal(e.locomotionOverride,override);
  for(const key of ['hp','atk','def','mdef','accuracy','attackRange','attackInterval','xp'])assert.deepEqual(e[key],base[key],id+':'+key);
  assert.equal(e.goldMean,base.gold);
 }
});
test('sixty full-health actual battles retain resources across each ten-fight series',()=>{
 assert.equal(report.sourcesChangedDuringRun,false);assert.equal(report.cases.length,6);
 assert.deepEqual(new Set(report.cases.map(c=>c.classId)),new Set(['knight','mage','ranger','assassin','necro']));
 // The report predates a documented return/patrol fix and city asset switch.
 // Check unchanged balance inputs, not a false claim of rerunning later geometry.
 for(const s of report.sourceHashes.filter(s=>['src/core/game-rules.ts','src/core/equipment-stats.ts','scripts/world_expansion_v3/p2-combat-smoke.mjs'].includes(s.path)))
  assert.equal(createHash('sha256').update(readFileSync(s.path)).digest('hex'),s.sha256,s.path);
 for(const c of report.cases){
  assert.equal(c.population,1151);assert.equal(c.failure,null);assert.equal(c.recoveryFailure,null);assert.equal(c.deaths,0);
  assert.equal(c.battles.length,10);assert.equal(new Set(c.battles.map(b=>b.uid)).size,10);assert.equal(c.initial.gold,320);
  assert.equal(c.initial.level,c.afterHunt.level);assert.equal(c.initial.hp,c.initial.maxHp);assert.equal(c.afterHunt.dead,false);
  c.battles.forEach((b,i)=>{assert.equal(b.killed,true);assert.equal(b.initialMonsterHp,b.expectedMaxHp);assert.equal(b.expectedMaxHp,p2Encounter({canonicalMobId:b.mobId,level:b.targetLevel}).hp);
   assert.ok(b.seconds>5);assert.ok(b.after.hp>0);if(i)assert.ok(b.before.hp<=c.battles[i-1].after.hp,'no refill between fights');});
  assert.ok(c.movementTrace.length>100);assert.ok(c.walkedMetres>400);
 }
});
test('actual money, potion stock and optional recovery balance independently',()=>{
 for(const c of report.cases){const l=enduranceLedger(c),count=xs=>xs.reduce((n,x)=>n+x.count,0);
  assert.equal(l.actualHuntPurchases,165);assert.equal(c.afterHunt.gold,c.initial.gold+c.ordinaryGold-165);
  assert.equal(c.beforeSale.gold,c.initial.gold+c.ordinaryGold-c.potionSpend);
  assert.equal(c.final.gold,c.beforeSale.gold+c.saleRevenue);assert.equal(c.cashNetAfterSale,c.final.gold-c.initial.gold);
  assert.equal(c.potionSpend,c.potionPurchases.reduce((n,x)=>n+x.cost,0));assert.ok(c.potionPurchases.every(x=>x.id==='potion'&&x.cost===55));
  assert.equal(c.healing.length,l.actualHuntUses+l.optionalRecoveryUses);assert.ok(c.healing.every(x=>x.hp>0&&x.hp<=37));
  assert.equal(c.beforeSale.hp,c.beforeSale.maxHp);assert.ok(l.replacementRatio>.4,'the unresolved economic gate must stay visible');
  const dropped=c.battles.flatMap(b=>b.loot).flatMap(e=>e.items??[]).filter(id=>id==='potion').length;
  assert.equal(count(c.afterHunt.potions),3+dropped-l.actualHuntUses);
 }
});
test('QUEST-102 was earned by actual unique deaths and a later service return',()=>{
 const c=report.cases.find(c=>c.quest.record);assert.equal(c.questBeforeReturn.status,'active');assert.equal(c.questBeforeReturn.kills,5);
 assert.deepEqual(c.questBeforeReturn.evidence,[]);assert.equal(c.questBeforeReturn.xpGranted,false);
 assert.equal(c.quest.record.status,'claimed');assert.deepEqual(c.quest.record.evidence,['returned-to-service']);
 assert.equal(c.quest.claim.outcome.xpAwarded,1200);assert.equal(c.quest.claim.outcome.items[0].id,'starter_chest_knight');
 assert.equal(new Set(c.quest.record.killKeys).size,5);for(const key of c.quest.record.killKeys){const [uid,generation]=JSON.parse(key);assert.ok(c.battles.some(b=>b.uid===uid&&b.generation===generation));}
 assert.ok(c.quest.claim.at>c.afterHunt.at);
});
test('real passive pursuit uses accepted speed, retains wounds and releases at home',()=>{
 const r=JSON.parse(readFileSync('docs/world-expansion-v3/P2_PURSUIT.json'));assert.equal(r.sourcesChangedDuringRun,false);assert.equal(r.cases.length,3);
 for(const c of r.cases){assert.equal(c.ok,true);assert.equal(c.population,1151);assert.equal(c.beforeHit.targetId,null);assert.equal(c.beforeHit.provokedBy,null);
  assert.equal(c.provokedBy,c.heroId);assert.equal(c.returnedHome,true);assert.equal(c.targetReleased,true);
  assert.ok(c.maximumHomeDistance>7);assert.ok(c.peakSpeed<=c.definitionSpeed+.001);assert.ok(c.peakSpeed>=c.definitionSpeed-.001);
  assert.ok(c.hpAfterHit<c.beforeHit.hp);assert.equal(c.remainingHp,c.hpAfterHit);}
});
