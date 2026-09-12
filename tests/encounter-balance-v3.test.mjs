import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CLASSES,ITEMS,MONSTERS} from '../src/data/game-data.ts';
import {attackDamageType,accuracyForDamage} from '../src/core/game-rules.ts';
import {resolveAttackAccuracy} from '../src/core/attack-accuracy.ts';
import {resolveMonsterDamageV3,resolveHeroDamageV3,enemyHitChanceV3} from '../src/core/encounter-combat-v3.ts';
import {MOBS_V3,MINI_BOSSES_V3,MAJOR_BOSSES_V3} from '../src/data/world-expansion-v3.ts';
import {STARTER_ITEMS_V3,CASTER_PHYSICAL_WEAPON_PROPOSALS_V3,REFERENCE_GEAR_FIXTURES_V3,
 BALANCE_BANDS_V3,LOOT_PROFILES_V3,POTIONS_BALANCE_V3,FIRST_HUNTING_BEHAVIORS_V3,
 ENCOUNTER_BALANCE_V3,baseEncounterStatsV3,encounterV3,miniEncounterV3} from '../src/data/encounter-balance-v3.ts';
import {generateBalance,referenceHero,expectedPlayerHit,estimateEncounter,baselineTarget,healingPurchase,runActualBookStress,
 renderBalanceReport} from '../scripts/world_expansion_v3/balance.mjs';

const before=JSON.stringify({ITEMS,MONSTERS});
const report=generateBalance();

test('typed mitigation chooses DEF or MDEF once, preserves damaging hits and has no level penalty',()=>{
 const target={def:150,mdef:50,resistances:{fire:.25}};
 assert.equal(resolveMonsterDamageV3(200,'physical',target),100);
 assert.equal(resolveMonsterDamageV3(200,'magic',target),150);
 assert.equal(resolveMonsterDamageV3(200,'magic',target,'fire'),113);
 assert.equal(resolveMonsterDamageV3(200,'physical',target,'none',50),120);
 assert.equal(resolveMonsterDamageV3(1,'physical',{def:10000,mdef:10000}),1);
 assert.equal(resolveMonsterDamageV3(0,'magic',target),0);
 assert.equal(resolveMonsterDamageV3(100,'magic',{def:0,mdef:0,resistances:{fire:1}},'fire'),65);
 assert.equal(resolveMonsterDamageV3(100,'magic',{def:0,mdef:0,resistances:{fire:-1}},'fire'),125);
 assert.throws(()=>resolveMonsterDamageV3(NaN,'physical',target),RangeError);
 assert.throws(()=>resolveMonsterDamageV3(100,'magic',{def:0,mdef:NaN}),RangeError);
 assert.equal(resolveMonsterDamageV3(200,'physical',{...target,level:1}),resolveMonsterDamageV3(200,'physical',{...target,level:90}));
});

test('hero physical reduction matches live rounding; magic correctly uses the different defense',()=>{
 const target={def:20,mdef:100};
 assert.equal(resolveHeroDamageV3(31,'physical',target),27);
 assert.equal(resolveHeroDamageV3(31,'magic',target),11);
 assert.equal(resolveHeroDamageV3(31,'physical',target,true),14);
 assert.equal(resolveHeroDamageV3(1,'magic',target),1);
 assert.equal(enemyHitChanceV3(100,25),.75);
 assert.equal(enemyHitChanceV3(100,1000),.25);
 assert.equal(enemyHitChanceV3(80,25),.6000000000000001);
});

test('starter is exactly fourteen accepted items; caster physical stats are explicit separate candidates',()=>{
 assert.equal(Object.keys(STARTER_ITEMS_V3).length,14);
 assert.deepEqual(STARTER_ITEMS_V3.starter_weapon_knight.atk,[8,12]);
 assert.equal(STARTER_ITEMS_V3.starter_weapon_necro.matk,14);
 assert.deepEqual(STARTER_ITEMS_V3.starter_weapon_necro.atk,[9,13]);
 assert.equal(STARTER_ITEMS_V3.starter_chest_knight.hp,20);
 assert.equal(STARTER_ITEMS_V3.starter_chest_mage.mdef,8);
 for(const item of Object.values(STARTER_ITEMS_V3)){
  assert.equal(item.requiredLevel,1);assert.equal(item.status,'fixture-not-live');assert.equal(item.assassinForeign,false);
 }
 for(const id of ['starter_weapon_mage','starter_weapon_necro','ember_staff','mourn_grimoire','rift_staff','rift_grimoire','warden_staff','warden_grimoire']){
  const physical=CASTER_PHYSICAL_WEAPON_PROPOSALS_V3[id];assert.ok(physical[0]>0&&physical[1]>physical[0],id);
 }
 const hero=referenceHero('necro',1,0);
 assert.equal(attackDamageType('necro'),'physical');
 assert.ok(hero.stats.atkMin>=10);assert.ok(hero.stats.matk>=14);
 assert.ok(expectedPlayerHit(hero,encounterV3('MOB-01',1)).damage>10);
});

test('reference equipment is fixed by tier and class, never level-multiplied old gear or legendary rings',()=>{
 assert.equal(Object.keys(REFERENCE_GEAR_FIXTURES_V3).length,42);
 for(const l of [30,49,50,69,70,90])for(const c of Object.keys(CLASSES)){
  const hero=referenceHero(c,l,3);assert.equal(Object.keys(hero.equipment).length,6);
  for(const item of Object.values(hero.equipment)){
   const def=REFERENCE_GEAR_FIXTURES_V3[item.id];assert.ok(def.requiredLevel<=l);assert.equal(def.status,'fixture-not-live');
   if(def.classes)assert.ok(def.classes.includes(c));assert.ok(!item.id.includes('ring')&&!item.id.includes('warden'));
  }
 }
 assert.deepEqual(referenceHero('knight',30).equipment,referenceHero('knight',49).equipment);
 assert.notDeepEqual(referenceHero('knight',49).equipment,referenceHero('knight',50).equipment);
});

test('actual accuracy/type contracts are used and target level is not an invisible miss modifier',()=>{
 for(const c of Object.keys(CLASSES)){
  const hero=referenceHero(c,15,3),target=baselineTarget(15),hit=expectedPlayerHit(hero,target);
  assert.equal(hit.type,attackDamageType(c));
  assert.equal(hit.hitChance,1-resolveAttackAccuracy(accuracyForDamage(hero.stats,hit.type),0).missChance);
  assert.deepEqual(hit,expectedPlayerHit(hero,{...target,level:90}));
  assert.ok(expectedPlayerHit(hero,{...target,def:150,mdef:150}).damage<hit.damage);
 }
});

test('all 48 identities have valid authored level profiles, independent attack types and finite nonimmune resists',()=>{
 assert.equal(report.species.length,48);
 for(const mob of MOBS_V3){
  for(let level=mob.levelBand[0];level<=mob.levelBand[1];level++){
   const e=encounterV3(mob.id,level);
   for(const key of ['hp','atk','def','mdef','accuracy','attackInterval','attackRange','movementSpeed','xp','gold'])assert.ok(Number.isFinite(e[key])&&e[key]>=0,mob.id+'/'+key);
   assert.ok(e.attackRange>=mob.actorRadius+.8);assert.equal(e.runtimeEnabled,false);
   for(const resistance of Object.values(e.resistances))assert.ok(resistance>=0&&resistance<=.35);
  }
  assert.throws(()=>encounterV3(mob.id,mob.levelBand[0]-1),RangeError);
 }
 assert.throws(()=>baseEncounterStatsV3(91),RangeError);
 assert.throws(()=>baseEncounterStatsV3(1.5),RangeError);
 const fire=encounterV3('MOB-39',66),ice=encounterV3('MOB-35',58);
 assert.equal(fire.resistances.fire,.25);assert.equal(ice.resistances.ice,.25);
 for(const e of [fire,ice]){assert.equal(e.counter.type,'magic');assert.ok(e.counter.range>13);assert.ok(e.counter.windup>=1);assert.equal(e.counter.requiresLOS,true);}
});

test('first five use allowed pre-book attacks and natural encounter recipes without a hard aggro cap',()=>{
 assert.equal(report.firstHunt.length,5);assert.equal(report.summary.firstHuntCases,190);
 const ids=new Set();
 for(const species of report.firstHunt)for(const r of species.rows){
  ids.add(r.target);assert.ok(r.level<=9);assert.equal(r.skills,0);assert.equal(r.mpSpent,0);
  assert.equal(r.assumptions.rotation,'auto-only');assert.equal(r.killed,true);assert.equal(r.healthBankSurvives,true);
 }
 assert.equal(ids.size,5);assert.equal(report.firstHunt.flatMap(m=>m.weaponOnlyRows).length,95);
 for(const r of report.firstHunt.flatMap(m=>m.weaponOnlyRows))assert.equal(r.healthBankSurvives,true);
 for(const m of FIRST_HUNTING_BEHAVIORS_V3){
  assert.equal(m.socialAggro,false);
  if(m.mobId==='MOB-02'){assert.equal(m.proximityAggro,8);assert.equal(m.placementGroupMax,2);}
  else assert.equal(m.proximityAggro,0);
  assert.equal('maxActiveAttackers' in m,false);
 }
 assert.equal(report.pairStress.length,25);assert.ok(report.pairStress.every(r=>r.survivesArithmetic));
 const noBooks=runActualBookStress(referenceHero('necro',9,0),encounterV3('MOB-05',9));
 assert.deepEqual(noBooks.bookIds,[]);assert.equal(noBooks.casts,0);
});

test('healing expenses buy whole bottles, preserve 37/70 and do not invent a survival cooldown',()=>{
 const early=POTIONS_BALANCE_V3.filter(p=>p.level===1);
 assert.deepEqual(early.map(p=>[p.heal,p.price]),[[37,55],[70,110]]);
 assert.deepEqual(healingPurchase(71,early),{doses:2,gold:165,items:{potion_large:1,potion:1}});
 assert.deepEqual(healingPurchase(0,early),{doses:0,gold:0,items:{}});
 assert.throws(()=>healingPurchase(NaN,early),RangeError);
 assert.throws(()=>healingPurchase(10,[]),RangeError);
 for(const row of report.candidateRows){
  assert.equal(row.assumptions.potionCooldown,'UNIMPLEMENTED / NOT ASSUMED for survival');
  for(const n of Object.values(row.fullRestorationTen.items))assert.ok(Number.isInteger(n)&&n>0);
 }
});

test('ordinary loot covers every identity once, uses accepted probabilities and cannot grant rings/boss pools',()=>{
 const numbers=LOOT_PROFILES_V3.flatMap(p=>p.mobs).sort((a,b)=>a-b);
 assert.deepEqual(numbers,Array.from({length:48},(_,i)=>i+1));
 assert.deepEqual(BALANCE_BANDS_V3.map(b=>b.equipment*1000),[30,40,50,60,70]);
 assert.deepEqual(BALANCE_BANDS_V3.map(b=>b.normalScroll),[.01,.015,.02,.025,.03]);
 assert.deepEqual(BALANCE_BANDS_V3.map(b=>b.improvedScroll),[0,.001,.002,.0035,.005]);
 for(const s of report.species){
  assert.equal(s.loot.families.primary.length,2);assert.equal(s.loot.families.secondary.length,1);
  assert.equal(Object.values(s.loot.category).reduce((a,b)=>a+b),1);
  assert.ok(s.loot.exclusions.includes('all-rings'));assert.ok(s.loot.exclusions.includes('warden_*'));
 }
});

test('twelve minis keep original location identity, separate rolls and persistent respawn; cave40 stays outside',()=>{
 assert.equal(report.minis.length,12);
 assert.equal(new Set(report.minis.map(m=>m.definition.locationId)).size,12);
 for(const m of MINI_BOSSES_V3){
  const e=miniEncounterV3(m.id),loot=e.loot;
  assert.deepEqual(e.respawn,m.respawn);assert.equal(e.level,m.level);
  assert.equal(loot.equipment,.35);assert.equal(loot.cloak,.05);assert.equal(loot.independentRolls,true);
  assert.equal(loot.ring,m.level>=25?.08:0);assert.equal(loot.core,m.level>=25?.35:0);
  assert.equal(loot.coreCount,1);assert.equal(loot.maxRingCount,1);assert.equal(loot.ringGrade,1);
  assert.ok(loot.guaranteedMaterialPool.every(id=>!['MAT-10','MAT-11','MAT-12'].includes(id)));
 }
 assert.throws(()=>miniEncounterV3('cave_boss'));
 assert.equal(MAJOR_BOSSES_V3.find(b=>b.speciesId==='cave_boss').level,40);
 assert.ok(!report.species.some(s=>s.mobId==='cave_boss'));
});

test('unchanged actual books expose percent-HP and mage40 stress, without pretending the boss gate passed',()=>{
 assert.equal(report.percentHpStress.length,3);
 for(const row of report.percentHpStress){
  assert.equal(row.killed,true);assert.equal(row.ttk,33.55);assert.equal(row.casts,1);
  assert.deepEqual(row.bookIds,['book_necro_40']);assert.equal(row.acceptedBooksModified,false);
  assert.equal(row.physicalCombatValidated,false);
 }
 assert.ok(report.mage40Stress[1].ttk<report.mage40Stress[0].ttk*.6);
 assert.equal(report.actualMiniBookStress.length,15);
 assert.ok(report.summary.existingBookBossGate.startsWith('UNRESOLVED'));
});

test('report exposes unresolved numerical cases, hashes real inputs and never mutates or activates live data',()=>{
 assert.equal(report.candidateRows.length,900);assert.equal(report.currentRows.length,900);
 assert.equal(report.summary.candidatePlus3Cases,450);
 assert.equal(report.summary.ttkFailures,report.candidateRows.filter(r=>r.plus===3&&!r.ttkWithinTarget).length);
 assert.ok(report.summary.ttkFailures>0);assert.ok(report.summary.fullRestorationEconomyFailures>0);
 assert.equal(report.summary.nativeCombatValidated,false);assert.equal(ENCOUNTER_BALANCE_V3.runtimeEnabled,false);
 assert.equal(JSON.stringify({ITEMS,MONSTERS}),before);
 for(const input of report.source)assert.equal(createHash('sha256').update(readFileSync(input.path)).digest('hex'),input.sha256);
 assert.equal(readFileSync('docs/world-expansion-v3/BALANCE_RESULTS.md','utf8'),renderBalanceReport(report));
 const saved=JSON.parse(readFileSync('docs/world-expansion-v3/BALANCE_DATA.json','utf8'));
 assert.deepEqual(saved.source,report.source,'Regenerate BALANCE_DATA after a real input changes');
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 assert.equal(digest(saved),digest(report),'Generated rows must exactly match the current model');
});
