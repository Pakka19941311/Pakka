import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {p2Encounter} from '../src/data/p2-encounters.ts';
const report=JSON.parse(readFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY.json'));
const history=JSON.parse(readFileSync('docs/world-expansion-v3/P2_EVIDENCE_HISTORY.json'));
const count=s=>s.potions.reduce((n,item)=>n+item.count,0);

test('historical five actual +3 series retain original fingerprints and all 1151 entities',()=>{
 assert.equal(history.status,'historical');
 assert.equal(createHash('sha256').update(readFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY.json')).digest('hex'),history.records.find(r=>r.file==='P2_PLUS3_ECONOMY.json').sha256);
 assert.equal(report.sourcesChangedDuringRun,false);assert.equal(report.cases.length,5);
 assert.deepEqual(new Set(report.cases.map(c=>c.classId)),new Set(['knight','mage','ranger','assassin','necro']));
 // Client art/yaw changes do not require repeating server combat evidence.
 for(const source of report.sourceHashes.filter(s=>['src/core/game-rules.ts','src/core/equipment-stats.ts','src/data/p2-encounters.ts','src/data/starter-progression-v3.ts'].includes(s.path)))
  assert.equal(createHash('sha256').update(readFileSync(history.archives.find(a=>a.path===source.path)?.archive??source.path)).digest('hex'),source.sha256,source.path);
 for(const c of report.cases){
  assert.equal(c.failure,null);assert.equal(c.recoveryFailure,null);assert.equal(c.population,1151);assert.equal(c.deaths,0);
  assert.equal(c.plus,3);assert.equal(Object.keys(c.referenceEquipment).length,6);
  assert.ok(Object.values(c.referenceEquipment).every(item=>item.plus===3&&item.id.startsWith('starter_')));
  assert.equal(c.battles.length,10);assert.equal(new Set(c.battles.map(b=>b.uid)).size,10);
  for(const [index,b] of c.battles.entries()){
   assert.equal(b.killed,true);assert.equal(b.initialMonsterHp,p2Encounter({canonicalMobId:b.mobId,level:b.targetLevel??b.level}).hp);
   if(index)assert.ok(b.before.hp<=c.battles[index-1].after.hp,'no health reset between encounters');
   if(['mage','ranger','necro'].includes(c.classId)){
    assert.ok(b.movement.length>0);assert.ok(b.releases>=1);
    for(const move of b.movement){
     const dt=(move.to.at-move.from.at)/1000,metres=Math.hypot(move.to.x-move.from.x,move.to.z-move.from.z);
     assert.ok(dt>0&&metres>0&&metres/dt<=7,'ordinary server movement after release');
    }
   }
  }
  assert.ok(c.walkedMetres>400);assert.ok(c.movementTrace.length>100);
 }
});

test('healing and stock are restored by actual purchases/use without free HP regeneration',()=>{
 for(const c of report.cases){
  assert.equal(c.initial.hp,c.initial.maxHp);assert.equal(count(c.initial),0);assert.equal(c.initial.level,c.final.level);
  assert.equal(count(c.provisioned),3);assert.equal(c.startupStockCost,165);assert.equal(c.provisioned.gold,c.initial.gold-165);
  assert.equal(c.final.hp,c.final.maxHp);assert.equal(c.final.mp,c.initial.mp);assert.ok(count(c.final)>=3);assert.equal(c.comparableEnd,true);
  assert.ok(c.potionPurchases.every(p=>p.id==='potion'&&p.cost===55));
  assert.equal(c.totalPotionSpend,c.potionPurchases.reduce((n,p)=>n+p.cost,0));
  assert.equal(c.repeatRoutePotionSpend,c.totalPotionSpend-c.startupStockCost);
  const potionDrops=c.battles.flatMap(b=>b.loot).flatMap(e=>e.items??[]).filter(id=>['potion','potion_large'].includes(id)).length;
  assert.equal(count(c.final),c.potionPurchases.length+potionDrops-c.healing.length,'complete bottle ledger');
  const received=c.healing.reduce((n,h)=>n+h.hp,0),damage=c.battles.reduce((n,b)=>n+b.damageTaken,0);
  assert.ok(Math.abs(c.initial.hp+received-damage-c.final.hp)<.01,'all actual HP accounted for, including wasted potion capacity');
  assert.equal(c.healing.length,c.huntUses+c.recoveryUses);
 }
});

test('realized sale, startup capital and repeat-route upkeep balance separately',()=>{
 for(const c of report.cases){
  assert.equal(c.huntGold,c.battles.flatMap(b=>b.loot).reduce((n,e)=>n+(e.gold??0),0));
  assert.equal(c.huntXp,c.battles.flatMap(b=>b.loot).reduce((n,e)=>n+(e.xp??0),0));
  assert.equal(c.final.xp,c.initial.xp+c.huntXp);
  assert.equal(c.saleRevenue,c.sales.reduce((n,s)=>n+s.gold,0));assert.equal(c.grossRealizedGold,c.huntGold+c.saleRevenue);
  assert.equal(c.final.gold,c.initial.gold+c.grossRealizedGold-c.totalPotionSpend);
  assert.equal(c.firstTripCashNet,c.final.gold-c.initial.gold);
  assert.equal(c.repeatRouteCashNet,c.grossRealizedGold-c.repeatRoutePotionSpend);
  assert.equal(c.actualRepeatRecoveryRatio,c.repeatRoutePotionSpend/c.grossRealizedGold);
  assert.equal(c.repeatRouteWithin40,c.comparableEnd&&c.actualRepeatRecoveryRatio<=.4,'an unmet design target remains visible');
  assert.ok(c.beforeSale.at>c.afterHunt.at&&c.atShop.at>=c.afterSale.at&&c.final.at>=c.atShop.at,'real service return before sale/recovery');
 }
});
