import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {p2Encounter} from '../src/data/p2-encounters.ts';
import {withExperimentalCadence,CADENCE_CANDIDATES} from '../scripts/world_expansion_v3/p2-upkeep-candidates.mjs';
const read=name=>JSON.parse(readFileSync('docs/world-expansion-v3/'+name+'.json'));
const candidates=read('P2_UPKEEP_CANDIDATES'),sensitivity=read('P2_UPKEEP_SENSITIVITY'),continuous=read('P2_UPKEEP_CONTINUOUS');
const sum=values=>values.reduce((a,b)=>a+b,0),count=s=>sum(s.potions.map(i=>i.count));

test('experimental profile scope is two weak species level1-2 and restores even after an exception',()=>{
 const keys=[...['MOB-01','MOB-03'].flatMap(canonicalMobId=>[1,2,3].map(level=>({canonicalMobId,level}))),
  ...[['MOB-02',7],['MOB-04',4],['MOB-05',8]].map(([canonicalMobId,level])=>({canonicalMobId,level}))];
 const before=keys.map(k=>structuredClone(p2Encounter(k))),candidate=CADENCE_CANDIDATES.find(c=>c.id==='both-plus-1');
 withExperimentalCadence(candidate,()=>keys.forEach((k,i)=>{
  const p=structuredClone(p2Encounter(k));
  const applies=['MOB-01','MOB-03'].includes(k.canonicalMobId)&&k.level<=2;
  assert.equal(p.attackInterval,applies?(k.canonicalMobId==='MOB-01'?candidate.slime:candidate.rat):before[i].attackInterval);
  p.attackInterval=before[i].attackInterval;assert.deepEqual(p,before[i],'HP, damage, windup, recovery, movement and loot unchanged');
 }));
 assert.throws(()=>withExperimentalCadence(candidate,()=>{throw Error('fixture-abort');}),/fixture-abort/);
 assert.deepEqual(keys.map(k=>p2Encounter(k)),before);
});

test('ATK minus1 cannot bypass the current minimum hit and comparisons keep actual full monster HP',()=>{
 for(const report of [candidates,sensitivity,continuous]){
  assert.equal(report.productionBalanceChanged,false);assert.equal(report.sourcesChangedDuringRun,false);
 }
 const baseline=candidates.rows.find(r=>r.id==='baseline'),atk=candidates.rows.find(r=>r.id==='weak-atk-minus-1');
 assert.equal(baseline.fights.length,10);assert.equal(atk.damageTaken,baseline.damageTaken);
 for(let i=0;i<10;i++){
  const b=baseline.fights[i],a=atk.fights[i];
  assert.equal(a.monsterAtk,b.monsterAtk-1);assert.deepEqual(a.incomingHits,b.incomingHits);
  assert.equal(a.ttk,b.ttk);assert.ok(b.incomingHits.every(hit=>hit.amount===1));
 }
 for(const row of candidates.rows)for(const f of row.fights){
  assert.equal(f.initialMonsterHp,p2Encounter({canonicalMobId:f.mobId,level:f.level}).hp);
  assert.equal(f.killed,true);assert.equal(f.heroDead,false);
 }
});

test('bottle thresholds are preserved per seed rather than rounded average damage',()=>{
 const marginal=sensitivity.rows.find(r=>r.id==='both-plus-0.9'),selected=sensitivity.rows.find(r=>r.id==='both-plus-1');
 assert.ok(marginal.batches.some(b=>b.bottles===2),'borderline proposal remains visibly insufficient');
 assert.equal(selected.batches.length,5);
 for(const row of sensitivity.rows)for(const b of row.batches){
  assert.equal(b.damageTaken,sum(b.fights.map(f=>f.damageTaken)));
  assert.equal(b.bottles,Math.ceil(b.damageTaken/37));assert.equal(b.fights.length,10);
 }
 assert.ok(selected.batches.every(b=>b.bottles===1));
});

test('three paired continuous seeds use commands for recovery, sale and restock without between-fight resets',()=>{
 assert.equal(continuous.rows.length,2);
 for(const row of continuous.rows){
  assert.deepEqual(row.cases.map(c=>c.seed),[1101,1107,1113]);
  for(const c of row.cases){
   assert.equal(c.population,10,'explicit synthetic population, never claimed as full1151');
   assert.equal(c.failure,null);assert.equal(c.recoveryFailure,null);assert.equal(c.deaths,0);
   assert.equal(c.battles.length,10);assert.equal(new Set(c.battles.map(b=>b.uid)).size,10);
   for(const [i,b]of c.battles.entries()){
    assert.equal(b.killed,true);assert.equal(b.targetLevel,2);
    assert.equal(b.initialMonsterHp,p2Encounter({canonicalMobId:b.mobId,level:b.targetLevel}).hp);
    if(i){assert.equal(b.before.hp,c.battles[i-1].after.hp);assert.equal(b.before.gold,c.battles[i-1].after.gold);}
   }
   assert.ok(c.walkedMetres>600);assert.ok(c.beforeSale.at>c.afterHunt.at&&c.atShop.at>=c.afterSale.at);
   assert.equal(c.final.hp,c.initial.maxHp);assert.equal(c.final.level,2);assert.ok(count(c.final)>=3);
   assert.equal(c.startupStockCost,165);assert.equal(count(c.provisioned),3);assert.equal(c.huntUses,0);
   assert.ok(c.potionPurchases.every(p=>p.cost===55&&p.id==='potion'));
   assert.equal(c.totalPotionSpend,sum(c.potionPurchases.map(p=>p.cost)));
   assert.equal(c.repeatRoutePotionSpend,c.totalPotionSpend-165);
   const drops=c.battles.flatMap(b=>b.loot).flatMap(e=>e.items??[]).filter(id=>['potion','potion_large'].includes(id)).length;
   assert.equal(count(c.final),c.potionPurchases.length+drops-c.healing.length);
   assert.equal(c.initial.hp+sum(c.healing.map(h=>h.hp))-sum(c.battles.map(b=>b.damageTaken)),c.final.hp);
   assert.equal(c.saleRevenue,sum(c.sales.map(s=>s.gold)));assert.equal(c.grossRealizedGold,c.huntGold+c.saleRevenue);
   assert.equal(c.final.gold,c.initial.gold+c.grossRealizedGold-c.totalPotionSpend);
   assert.equal(c.repeatRouteCashNet,c.grossRealizedGold-c.repeatRoutePotionSpend);
   assert.equal(c.actualRepeatRecoveryRatio,c.repeatRoutePotionSpend/c.grossRealizedGold);
  }
 }
 const selected=continuous.rows.find(r=>r.id==='both-plus-1');
 for(const c of selected.cases){
  assert.equal(c.healing.length,1);assert.equal(sum(c.battles.map(b=>b.damageTaken)),33);
  assert.ok(c.repeatRouteWithin40);const mean=sum(c.battles.map(b=>b.seconds))/10;assert.ok(mean>=10&&mean<=18);
 }
});
