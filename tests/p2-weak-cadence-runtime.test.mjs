import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {p2Encounter,P2_WEAK_CADENCE_V3,P2_BALANCE_VERSION} from '../src/data/p2-encounters.ts';
import {encounterV3} from '../src/data/encounter-balance-v3.ts';
import {MOBS_V3} from '../src/data/world-expansion-v3.ts';
import {makeP2Geography,makeP2Simulation,P2MemoryStore} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
const sum=values=>values.reduce((a,b)=>a+b,0),count=s=>sum(s.potions.map(i=>i.count));
const readReport=()=>JSON.parse(readFileSync('docs/world-expansion-v3/P2_WEAK_CADENCE_RUNTIME.json'));

test('accepted cadence changes only first-two-level slime/rat repeat interval, with original damage and attack phases',()=>{
 assert.equal(P2_WEAK_CADENCE_V3.version,'p2-weak-cadence-v1');assert.equal(p2Encounter({id:'spider'}),null);
 for(const mob of MOBS_V3.slice(0,5))for(let level=mob.levelBand[0];level<=mob.levelBand[1];level++){
  const base=encounterV3(mob.id,level),live=p2Encounter({canonicalMobId:mob.id,level});
  const applies=['MOB-01','MOB-03'].includes(mob.id)&&level<=2;
  assert.equal(live.attackInterval,base.attackInterval+(applies?1:0));assert.equal(live.cadenceOverride,applies);
  assert.equal(live.cadenceVersion,applies?P2_WEAK_CADENCE_V3.version:null);
  for(const key of ['hp','atk','def','mdef','accuracy','attackRange','windup','recovery','xp','resistances','damageType'])
   assert.deepEqual(live[key],base[key],mob.id+':'+level+':'+key);
  assert.equal(live.goldMean,base.gold);assert.deepEqual(live.gold,[Math.floor(base.gold*.9),Math.ceil(base.gold*1.1)]);
 }
});

test('version reconciliation preserves wounded/dead ordinary state and all four major boss clocks',()=>{
 const geography=makeP2Geography(),store=new P2MemoryStore();let sim=makeP2Simulation({geography,store});
 const ordinary=sim.state.monsters.filter(m=>m.canonicalMobId==='MOB-01'&&m.level===2),wounded=ordinary[0],dead=ordinary[1];
 Object.assign(wounded,{hp:77,attackReadyAt:9200,balanceVersion:'encounter-balance-v3-candidate-1'});
 Object.assign(dead,{hp:0,alive:false,deathAt:900,respawnAt:999999,generation:12,owner:'prior-owner',balanceVersion:'encounter-balance-v3-candidate-1'});
 for(const [i,boss]of sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss).entries())
  Object.assign(boss,{hp:0,alive:false,deathAt:900,respawnAt:899999+i,generation:7+i,owner:'boss-owner'});
 const bosses=structuredClone(sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss));
 sim.checkpoint();sim=makeP2Simulation({geography,store,now:1000});
 assert.equal(sim.state.monsters.length,1151);assert.deepEqual(sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss),bosses);
 const afterWound=sim.state.monsters.find(m=>m.uid===wounded.uid),afterDeath=sim.state.monsters.find(m=>m.uid===dead.uid);
 assert.equal(afterWound.hp,77);assert.equal(afterWound.attackReadyAt,9200);assert.equal(afterWound.balanceVersion,P2_BALANCE_VERSION);
 assert.equal(afterDeath.hp,0);assert.equal(afterDeath.alive,false);assert.equal(afterDeath.respawnAt,999999);
 assert.equal(afterDeath.generation,12);assert.equal(afterDeath.owner,'prior-owner');assert.equal(afterDeath.balanceVersion,P2_BALANCE_VERSION);
});

test('current full1151 route uses ten full targets and actual repeat purchases with continuous resources',()=>{
 const report=readReport(),c=report.cases[0];assert.equal(report.sourcesChangedDuringRun,false);
 assert.equal(report.cases.length,1);assert.equal(report.balanceVersion,P2_BALANCE_VERSION);
 assert.equal(c.classId,'knight');assert.equal(c.level,2);assert.equal(c.plus,3);assert.equal(c.population,1151);
 assert.equal(c.failure,null);assert.equal(c.recoveryFailure,null);assert.equal(c.deaths,0);assert.equal(c.battles.length,10);
 assert.equal(new Set(c.battles.map(b=>b.uid)).size,10);
 for(const [i,b]of c.battles.entries()){
  assert.equal(b.targetLevel,2);assert.equal(b.initialMonsterHp,p2Encounter({canonicalMobId:b.mobId,level:2}).hp);
  assert.equal(b.killed,true);if(i){assert.equal(b.before.hp,c.battles[i-1].after.hp);assert.equal(b.before.gold,c.battles[i-1].after.gold);}
 }
 assert.equal(c.startupStockCost,165);assert.equal(count(c.provisioned),3);assert.equal(c.final.hp,c.initial.maxHp);
 assert.equal(c.final.level,2);assert.equal(c.final.mp,c.initial.mp);assert.ok(count(c.final)>=3);assert.ok(c.walkedMetres>600);
 assert.ok(c.potionPurchases.every(p=>p.id==='potion'&&p.cost===55));assert.equal(c.totalPotionSpend,sum(c.potionPurchases.map(p=>p.cost)));
 assert.equal(c.repeatRoutePotionSpend,c.totalPotionSpend-165);assert.equal(c.grossRealizedGold,c.huntGold+c.saleRevenue);
 assert.equal(c.saleRevenue,sum(c.sales.map(s=>s.gold)));assert.equal(c.final.gold,c.initial.gold+c.grossRealizedGold-c.totalPotionSpend);
 const drops=c.battles.flatMap(b=>b.loot).flatMap(e=>e.items??[]).filter(id=>['potion','potion_large'].includes(id)).length;
 assert.equal(count(c.final),c.potionPurchases.length+drops-c.healing.length);
 assert.equal(c.initial.hp+sum(c.healing.map(h=>h.hp))-sum(c.battles.map(b=>b.damageTaken)),c.final.hp);
 assert.equal(c.repeatRouteWithin40,true);const mean=sum(c.battles.map(b=>b.seconds))/10;assert.ok(mean>=10&&mean<=18);
 assert.ok(c.beforeSale.at>c.afterHunt.at&&c.atShop.at>=c.afterSale.at,'real return and trade before recovery');
});

test('all five classes complete ordinary level1 smoke against full authored HP and receive exactly one actual loot event',()=>{
 const r=readReport();assert.equal(r.level1.length,10);
 for(const c of r.level1){
  assert.equal(c.level,1);assert.equal(c.plus,0);assert.equal(c.population,1);assert.equal(c.scenario,'isolated-target-on-real-terrain');
  assert.equal(c.killed,true);assert.equal(c.heroDead,false);assert.equal(c.monsterHp,p2Encounter({canonicalMobId:c.mobId,level:1}).hp);
  assert.ok(c.playerHits>=5&&c.playerReleaseCount>=c.playerHits);assert.ok(c.damageDealt>=c.monsterHp);
  assert.equal(c.lootEvents,1);assert.equal(c.mpSpent,0);assert.equal(c.serverPhysics,true);assert.equal(c.nativeAnimationValidated,false);
 }
});
