import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CLASSES,ITEMS} from '../../src/data/game-data.ts';
import {SKILL_BOOKS} from '../../src/data/skill-books.ts';
import {BookSystem} from '../../src/server/book-system.ts';
import {resolveTypedMonsterDamage} from '../../src/core/monster-damage.ts';
import {calculateEquipmentStats} from '../../src/core/equipment-stats.ts';
import {classCombatProfile,attackDamageType,accuracyForDamage,xpNeeded} from '../../src/core/game-rules.ts';
import {resolveAttackAccuracy} from '../../src/core/attack-accuracy.ts';
import {resolveMonsterDamageV3,resolveHeroDamageV3,enemyHitChanceV3} from '../../src/core/encounter-combat-v3.ts';
import {MOBS_V3,MINI_BOSSES_V3} from '../../src/data/world-expansion-v3.ts';
import {P2_MOVEMENT_V3} from '../../src/data/p2-encounters.ts';
import {STARTER_ITEMS_V3,REFERENCE_GEAR_FIXTURES_V3,CASTER_PHYSICAL_WEAPON_PROPOSALS_V3,
 POTIONS_BALANCE_V3,BALANCE_BANDS_V3,ENCOUNTER_BALANCE_V3,baseEncounterStatsV3,baseGoldV3,baseXpV3,
 encounterV3,miniEncounterV3,lootProfileV3,FIRST_HUNTING_BEHAVIORS_V3,FIRST_HUNTING_GENERATOR_GATES_V3} from '../../src/data/encounter-balance-v3.ts';
const round=(n,digits=2)=>Number(n.toFixed(digits));
const hash=path=>createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
const CLASSES_IDS=Object.keys(CLASSES);
export const TTK_TARGETS={knight:[10,18],mage:[8,15],ranger:[9,17],assassin:[8,15],necro:[11,20]};
/** Fewest whole bottles, then the cheapest sufficient last dose. Larger potions
 * are not forced when one 37 HP dose is enough. No fractional-bottle expense. */
export function healingPurchase(needed,potions){
 if(!Number.isFinite(needed)||!potions.length||potions.some(p=>!Number.isFinite(p.heal)||p.heal<=0||!Number.isFinite(p.price)||p.price<0))throw new RangeError('Finite healing demand and positive potion definitions required');
 if(needed<=0)return {doses:0,gold:0,items:{}};
 const sorted=[...potions].sort((a,b)=>a.heal-b.heal),largest=sorted.at(-1);
 const full=Math.max(0,Math.ceil(needed/largest.heal)-1),remaining=needed-full*largest.heal;
 const last=sorted.filter(p=>p.heal>=remaining).sort((a,b)=>a.price-b.price)[0];
 const items={};if(full)items[largest.id]=full;items[last.id]=(items[last.id]??0)+1;
 return {doses:full+1,gold:full*largest.price+last.price,items};
}
function expectedLootHealingCost(needed,level,potions){
 const band=BALANCE_BANDS_V3.find(b=>level>=b.min&&level<=b.max),chance=band.consumable*.55,heal=level<30?37:70;
 let coefficient=1,expected=0;
 for(let successes=0;successes<=10;successes++){
  if(successes)coefficient=coefficient*(11-successes)/successes;
  expected+=coefficient*chance**successes*(1-chance)**(10-successes)*healingPurchase(Math.max(0,needed-successes*heal),potions).gold;
 }
 return expected;
}
export function referenceHero(classId,level,plus=3,mode='candidate',{slots=null}={}){
 const cls=CLASSES[classId];if(!cls)throw Error('Unknown class');
 const definitions={...ITEMS,...STARTER_ITEMS_V3,...REFERENCE_GEAR_FIXTURES_V3};
 let selected;
 if(mode==='candidate'&&level<10)selected=['starter_weapon_'+classId,'starter_chest_'+classId,'starter_head','starter_gloves','starter_boots','starter_belt'];
 else if(mode==='candidate'&&level>=30){
  const tier=level<50?'deep':level<70?'high':'end';
  selected=['v3_ref_'+tier+'_weapon_'+classId,'v3_ref_'+tier+'_chest_'+classId,...['head','gloves','boots','belt'].map(s=>'v3_ref_'+tier+'_'+s)];
 }else selected=[cls.weapon,cls.armor,'fallen_helm','wolf_gloves','grave_boots','ash_belt'];
 if(slots)selected=selected.filter(id=>slots.includes(definitions[id].slot));
 const equipment=Object.fromEntries(selected.map(id=>[definitions[id].slot,{id,plus}]));
 const definitionFor=item=>{
  const def=definitions[item.id];
  if(mode==='candidate'&&CASTER_PHYSICAL_WEAPON_PROPOSALS_V3[item.id])return {...def,atk:CASTER_PHYSICAL_WEAPON_PROPOSALS_V3[item.id]};
  return def;
 };
 const hero=calculateEquipmentStats(classId,cls.stats,level,equipment,definitionFor);
 return {...hero,classId,level,plus,mode,equipment,gearStage:slots?'specified-slots':'six-piece-reference',profile:classCombatProfile(classId,level,hero.stats)};
}
/** Expected value of actual contacted player attacks. Damage samples are
 * uniform midpoint quadrature; hit chance is returned by the live resolver.
 * No target-level accuracy modifier exists in this model.
 */
export function expectedPlayerHit(hero,monster,{skill=null,defense='proposed'}={}){
 const type=attackDamageType(hero.classId,Boolean(skill));
 const accuracy=accuracyForDamage(hero.stats,type);
 const hitChance=1-resolveAttackAccuracy(accuracy,0).missChance;
 const critChance=hero.stats.crit/100,multiplier=skill?.mul??1;
 const element=skill?.fx==='fire'?'fire':skill?.fx==='ice'?'ice':skill?.fx==='poison'?'poison':
 ['shadow','curse','drain','bone'].includes(skill?.fx)?'shadow':'none';
 let expected=0,rawExpected=0;
 for(let i=0;i<64;i++){
  const raw=type==='magic'?hero.stats.matk:hero.stats.atkMin+(hero.stats.atkMax-hero.stats.atkMin)*(i+.5)/64;
  for(const [critical,probability] of [[false,1-critChance],[true,critChance]]){
   const released=Math.round(raw*multiplier*(critical?hero.profile.critMultiplier:1));
   rawExpected+=released*probability/64;
   expected+=(defense==='proposed'?resolveMonsterDamageV3(released,type,monster,element):released)*probability/64;
  }
 }
 return {damage:expected*hitChance,rawDamage:rawExpected*hitChance,hitChance,type};
}
export function baselineTarget(level){
 return {...baseEncounterStatsV3(level),id:'baseline',level,style:'contact',type:'physical',resistances:{},accuracy:100,
 attackInterval:2.3,windup:.45,recovery:.7,attackRange:2.1,counter:null,gold:baseGoldV3(level),xp:baseXpV3(level)};
}
/** Event-time arithmetic using live class intervals, attack typing and critical
 * multiplier. Only permitted auto-attacks: legacy CLASSES.skills are rejected
 * by live intent. Actual books are measured separately by runActualBookStress.
 * It is NOT WorldSimulation/native AI or proof of the contact assumptions.
 */
export function estimateEncounter(hero,monster,{defense='proposed',active=true,maxSeconds=1200}={}){
 let hp=monster.hp,time=0;
 const cls=CLASSES[hero.classId],interval=hero.profile.attackInterval;
 let nextPlayer=0,attacks=0;
 while(hp>0&&time<maxSeconds){
  time=nextPlayer;
  const hit=expectedPlayerHit(hero,monster,{defense});hp-=hit.damage;attacks++;
  nextPlayer=time+interval;
 }
 const approach=cls.ranged?.35:hero.classId==='assassin'?1.1:1.0;
 const ttk=Math.max(interval*.4,time)+approach;
 const hitProbability=enemyHitChanceV3(monster.accuracy,hero.stats.evasion);
 const basic=resolveHeroDamageV3(monster.atk,defense==='current'?'physical':monster.type,hero.stats);
 const counter=monster.counter;
 const normalUptime=counter?Math.max(0,1-(counter.windup+counter.recovery)/counter.cooldown):1;
 // Scenario assumptions, not a measured dodge rate. Stationary mode uses 100%.
 const contact=active?(cls.ranged?(monster.attackRange>=9?.65:.4):.85):1;
 const counterContact=active?.5:1;
 const counterDamage=counter?resolveHeroDamageV3(monster.atk*counter.multiplier,defense==='current'?'physical':counter.type??monster.type,hero.stats):0;
 const incomingDps=basic*hitProbability/monster.attackInterval*normalUptime*contact+
  (counter?counterDamage*hitProbability/counter.cooldown*counterContact:0);
 const incoming=Math.max(0,ttk-monster.windup)*incomingDps;
 const lostHp=incoming;
 const potions=POTIONS_BALANCE_V3.filter(p=>p.level<=hero.level&&(hero.mode==='candidate'||p.status==='live'));
 const potion=potions.at(-1);
 const purchase=healingPurchase(lostHp*10,potions),cost=purchase.gold;
 const killsToLevel=Math.ceil(xpNeeded(hero.level)/Math.max(1,monster.xp));
 const progressionLoss=Math.max(0,lostHp-hero.maxHp/killsToLevel); // Live level-up refill; no quest XP invented.
 const progressionPurchase=healingPurchase(progressionLoss*10,potions);
 return {classId:hero.classId,level:hero.level,plus:hero.plus,gearMode:hero.mode,gearStage:hero.gearStage,target:monster.mobId??monster.id??monster.speciesId,
 targetLevel:monster.level,style:monster.style,ttk:round(ttk),killed:hp<=0,attacks,skills:0,manaStarvedAttacks:0,
 mpSpent:0,mpNet:0,summonDamage:0,estimatedDamageTaken:round(incoming),
 rawLeechEstimate:0,netHpLoss:round(lostHp),maxHp:hero.maxHp,healthBankSurvives:lostHp<hero.maxHp,
 basicHit:basic,incomingDps:round(incomingDps),potion:potion.id,fullRestorationTen:{...purchase,ratio:round(cost/(monster.gold*10),4)},
 lootAdjustedRestorationTen:{expectedGold:round(expectedLootHealingCost(lostHp*10,hero.level,potions)),ratio:round(expectedLootHealingCost(lostHp*10,hero.level,potions)/(monster.gold*10),4)},
 progressionAmortizedTen:{...progressionPurchase,ratio:round(progressionPurchase.gold/(monster.gold*10),4)},
 etherTen:{doses:0,gold:0},
 ttkTarget:TTK_TARGETS[hero.classId],ttkWithinTarget:ttk>=TTK_TARGETS[hero.classId][0]&&ttk<=TTK_TARGETS[hero.classId][1],
 assumptions:{defense,contact,counterContact,levelUpRefill:'amortized only; not an extra passive heal',potionCooldown:'UNIMPLEMENTED / NOT ASSUMED for survival',
 posture:active?'estimated active contact; no native movement':'stationary arithmetic',rotation:'auto-only'}};
}
/** Runs the ACTUAL BookSystem against an isolated host at favorable 1.8 m
 * distance and clear LOS. Raw book parameters stay unchanged. This is a
 * deterministic engine-logic stress test, not physics/native combat and not
 * validation of real combat movement. Candidate defense is explicit here.
 */
export function runActualBookStress(reference,definition,{maxSeconds=600,bookLevelCap=reference.level,onlyBooks=null,autoAttack=true}={}){
 let now=0,sequence=0,casts=0,damageBySource={},source='book',sourcePrefix='',nextAttack=0,nextEnemy=0;
 let summons=[],areas=[],traps=[];
 const p={...reference,stats:structuredClone(reference.stats),id:'balance-hero',x:0,z:0,spaceId:'surface',
  hp:reference.maxHp,mp:reference.maxMp,dead:false,grounded:true,generation:1,activeUntil:Infinity,yaw:Math.PI/2,
  buffs:{vanish:0},inventory:Object.values(SKILL_BOOKS).filter(b=>b.classId===reference.classId&&b.level<=reference.level).map(b=>({id:b.id,count:1})),
  bookCooldowns:{},bookEffects:[],attackReadyAt:0};
 const m={...definition,uid:'balance-target',id:definition.speciesId??'balance-target',x:1.8,z:0,spaceId:'surface',
  hp:definition.hp,alive:true,generation:1,bookEffects:[],bookDots:[],status:{stun:0,slow:0},home:{x:1.8,z:0},targetId:p.id};
 const host={now:()=>now,heroes:()=>[p],monsters:()=>[m],summons:()=>summons,areas:()=>areas,traps:()=>traps,
  random:()=>.5,uid:()=>String(++sequence),hp:()=>definition.hp,safe:()=>false,visible:()=>true,
  damage:(_m,packet)=>{if(!m.alive)return;const amount=resolveTypedMonsterDamage(packet,definition,{defDown:books.value(m,'defDown'),mdefDown:books.value(m,'mdefDown')});const key=sourcePrefix+source;damageBySource[key]=(damageBySource[key]??0)+amount;m.hp=Math.max(0,m.hp-amount);m.alive=m.hp>0;},
  recalculate:()=>{p.stats=structuredClone(reference.stats);p.maxHp=reference.maxHp;p.maxMp=reference.maxMp;books.modifyStats(p);},
  event:(kind,_actor,_target,extra)=>{if(kind==='release')source=extra?.effect??'book';},provoke:()=>{},release:()=>{},cancel:()=>{},
  summonPoint:()=>({x:1,z:0,spaceId:'surface'})};
 const books=new BookSystem(host);
 const available=Object.values(SKILL_BOOKS).filter(b=>b.classId===p.classId&&b.level<=Math.min(p.level,bookLevelCap)&&(!onlyBooks||onlyBooks.includes(b.id)));
 // Buffs and persistent summons first; the 250 ms real book cast gate still applies.
 const priority=[...available].sort((a,b)=>Number(b.mode==='self')-Number(a.mode==='self')||b.level-a.level);
 for(now=0;now<maxSeconds*1000&&m.alive;now+=50){
  p.mp=Math.min(p.maxMp,p.mp+p.stats.manaRegen*.05);
  for(const book of priority){
   if((p.bookCastReadyAt??0)>now||(p.bookCooldowns[book.id]??0)>now||p.mp<book.cost)continue;
   if(book.mode==='self'&&books.effects(p).some(e=>e.id===book.id&&e.expiresAt>now+500))continue;
   books.cast(p,book.id,book.mode==='ally'?p.id:m.uid,{x:m.x,z:m.z,spaceId:'surface'});casts++;break;
  }
  source='book-tick';books.tick();
  summons=summons.filter(s=>s.expiresAt>now);
  for(const summon of summons){sourcePrefix='summon:'+summon.bookKind+':';books.summonTick(summon,.05,(s,goal,step)=>{
   const length=Math.max(.001,Math.hypot(goal.x-s.x,goal.z-s.z)),scale=Math.min(1,step/length);s.x+=(goal.x-s.x)*scale;s.z+=(goal.z-s.z)*scale;
  });sourcePrefix='';}
  if(now>=nextEnemy){books.attacked(p,m);nextEnemy=now+definition.attackInterval*1000;}
  if(autoAttack&&now>=nextAttack&&m.alive){
   p.profile=classCombatProfile(p.classId,p.level,p.stats);
   const hit=expectedPlayerHit(p,m,{defense:'current'});
   source='auto';host.damage(m,{raw:books.normalDamage(p,hit.damage),type:attackDamageType(p.classId),element:'none',source:'ordinary',critical:false});
   if(attackDamageType(p.classId)==='physical')books.physicalHit(p,m);
   nextAttack=now+p.profile.attackInterval/books.attackSpeed(p)*1000;
  }
 }
 return {classId:p.classId,level:p.level,target:definition.id??definition.mobId??definition.speciesId,ttk:round(now/1000),
  killed:!m.alive,casts,bookIds:available.map(b=>b.id),damageBySource,mpRemaining:round(p.mp),
  actualModule:'src/server/book-system.ts',mode:'current-typed-book-damage-on-explicit-candidate-defense; favorable fixed geometry; no physics',
  rng:.5,physicalCombatValidated:false,acceptedBooksModified:false};
}

function contractFor(mob){
 const profile=lootProfileV3(mob.id),level=Math.floor((mob.levelBand[0]+mob.levelBand[1])/2);
 const material=mob.id==='MOB-05'?'iron':profile.material;
 return {mobId:mob.id,profileId:profile.id,levelBand:mob.levelBand,
 category:{weapon:.4,armor:.5,accessory:.1},families:{primary:profile.families.slice(0,2),secondary:profile.families.slice(2),weights:[.7,.3]},
 bandProbabilities:BALANCE_BANDS_V3.filter(b=>mob.levelBand[0]<=b.max&&mob.levelBand[1]>=b.min),
 materials:{base:material,chance:['fire_core','ice_core'].includes(material)?.35:material==='ancient_shard'?.15:.55,count:1,
  craftSource:'RING-003 / independent; no duplicated base material grant'},
 consumable:{potion:.55,ether:.4,haste:.05,count:1},scroll:'one categorical roll: improved / normal / none; then weapon/armor 50:50',
 exclusions:['all-rings','starter_*','warden_*','books','teleport','legacy-fallback-drops'],
 itemPoolStatus:level>=30?'reference-definitions-await-production-items-and-assets':'live-ordinary-base-needs-new-pool-wiring'};
}
export function generateBalance(){
 const rows=[],currentRows=[];
 for(let level=1;level<=90;level++)for(const classId of CLASSES_IDS)for(const plus of [0,3]){
  rows.push(estimateEncounter(referenceHero(classId,level,plus),baselineTarget(level)));
  currentRows.push(estimateEncounter(referenceHero(classId,level,plus,'live'),baselineTarget(level),{defense:'current'}));
 }
 const species=MOBS_V3.map(m=>({mobId:m.id,profiles:[...new Set([m.levelBand[0],Math.floor((m.levelBand[0]+m.levelBand[1])/2),m.levelBand[1]])].map(l=>encounterV3(m.id,l)),loot:contractFor(m),
  estimates:CLASSES_IDS.flatMap(c=>[0,3].map(plus=>estimateEncounter(referenceHero(c,Math.floor((m.levelBand[0]+m.levelBand[1])/2),plus),encounterV3(m.id,Math.floor((m.levelBand[0]+m.levelBand[1])/2)))))}));
 const minis=MINI_BOSSES_V3.map(m=>({definition:miniEncounterV3(m.id),
  estimates:CLASSES_IDS.map(c=>estimateEncounter(referenceHero(c,m.level,3),miniEncounterV3(m.id)))}));
 const underlevel=[];
 for(const id of ['MOB-35','MOB-39']){
  const monster=encounterV3(id,id==='MOB-35'?58:66);
  for(const c of CLASSES_IDS){
   const hero=referenceHero(c,15,3);
   const result=estimateEncounter(hero,monster,{active:false});
   const counterHit=resolveHeroDamageV3(monster.atk*monster.counter.multiplier,monster.counter.type,hero.stats);
   underlevel.push({...result,counterHit,fullHpCounterHitsToKill:Math.ceil(hero.maxHp/counterHit),
    zeroCounterKitePossibleInArithmetic:true,antiFarmStatus:'BLOCKED until real counter/LOS/leash and shared potion cooldown validated'});
  }
 }
 const firstHunt=MOBS_V3.slice(0,5).map(m=>{
  const levels=Array.from({length:m.levelBand[1]-m.levelBand[0]+1},(_,i)=>m.levelBand[0]+i);
  return {mobId:m.id,behavior:FIRST_HUNTING_BEHAVIORS_V3.find(b=>b.mobId===m.id),profiles:levels.map(l=>encounterV3(m.id,l)),
   rows:levels.flatMap(l=>CLASSES_IDS.flatMap(c=>[0,3].map(p=>estimateEncounter(referenceHero(c,l,p),encounterV3(m.id,l))))),
   weaponOnlyRows:levels.flatMap(l=>CLASSES_IDS.map(c=>estimateEncounter(referenceHero(c,l,0,'candidate',{slots:['weapon']}),encounterV3(m.id,l)))),
   liveBaseGearComparison:CLASSES_IDS.map(c=>estimateEncounter(referenceHero(c,m.levelBand[0],0,'live'),encounterV3(m.id,m.levelBand[0]),{defense:'current'}))};
 });
 const wolf=firstHunt.find(m=>m.mobId==='MOB-02');
 const pairStress=wolf.rows.filter(r=>r.plus===0).map(r=>({classId:r.classId,level:r.level,plus:0,
  target:r.target,estimatedSequentialPairLoss:round(r.netHpLoss*3),maxHp:r.maxHp,survivesArithmetic:r.netHpLoss*3<r.maxHp,
  assumption:'Both wolves hit throughout first kill; remaining wolf throughout second. No aggro suppression and no potion healing.'}));
 const bookStress=[40,60,90].flatMap(l=>CLASSES_IDS.map(c=>runActualBookStress(referenceHero(c,l,3),{...baselineTarget(l),id:'stress-10000hp',hp:10000})));
 const percentHpStress=[1000,10000,100000].map(hp=>runActualBookStress(referenceHero('necro',40,3),{...baselineTarget(40),id:'percent-hp-'+hp,hp},
  {onlyBooks:['book_necro_40'],autoAttack:false,maxSeconds:120}));
 const mage40Stress=[39,40].map(cap=>({...runActualBookStress(referenceHero('mage',40,3),{...baselineTarget(40),id:'mage-40-buff-comparison',hp:10000},{bookLevelCap:cap}),bookLevelCap:cap}));
 const actualMiniBookStress=MINI_BOSSES_V3.filter(m=>['RB-101','RB-106','RB-112'].includes(m.id)).flatMap(m=>CLASSES_IDS.map(c=>runActualBookStress(referenceHero(c,m.level,3),miniEncounterV3(m.id))));
 const plus3=rows.filter(r=>r.plus===3);
 const summary={candidatePlus3Cases:plus3.length,ttkFailures:plus3.filter(r=>!r.ttkWithinTarget).length,
 fullRestorationEconomyFailures:plus3.filter(r=>r.fullRestorationTen.ratio>.4).length,
 lootAdjustedEconomyFailures:plus3.filter(r=>r.lootAdjustedRestorationTen.ratio>.4).length,
 progressionEconomyFailures:plus3.filter(r=>r.progressionAmortizedTen.ratio>.4).length,
 healthBankSurvivalFailures:plus3.filter(r=>!r.healthBankSurvives).length,
 manaStarvedCases:plus3.filter(r=>r.manaStarvedAttacks>0).length,
 speciesCases:species.reduce((n,s)=>n+s.estimates.length,0),
 speciesPlus3HealthBankFailures:species.flatMap(s=>s.estimates).filter(r=>r.plus===3&&!r.healthBankSurvives).length,
 golemPlus3TtkFailures:species.filter(s=>['MOB-35','MOB-39'].includes(s.mobId)).flatMap(s=>s.estimates).filter(r=>r.plus===3&&(r.ttk<18||r.ttk>35)).length,
 firstHuntCases:firstHunt.reduce((n,m)=>n+m.rows.length,0),
 firstHuntHealthBankFailures:firstHunt.flatMap(m=>m.rows).filter(r=>!r.healthBankSurvives).length,
 firstHuntWeaponOnlyHealthBankFailures:firstHunt.flatMap(m=>m.weaponOnlyRows).filter(r=>!r.healthBankSurvives).length,
 firstHuntPlus0TtkOver20:firstHunt.flatMap(m=>m.rows).filter(r=>r.plus===0&&r.ttk>20).length,
 firstHuntPairHealthBankFailures:pairStress.filter(r=>!r.survivesArithmetic).length,
 miniAutoTtkFailures:minis.flatMap(m=>m.estimates).filter(r=>r.ttk<(r.level<30?60:120)||r.ttk>(r.level<30?120:240)).length,
 bookStressCases:bookStress.length+percentHpStress.length+mage40Stress.length+actualMiniBookStress.length,
 existingBookBossGate:'UNRESOLVED: necro40 percent-max-HP / mage40 direct damage; accepted books unchanged',
 curveStatus:'candidate, NOT live-balanced',nativeCombatValidated:false};
 const source=['src/core/game-rules.ts','src/core/equipment-stats.ts','src/core/attack-accuracy.ts','src/core/item-progression.ts',
 'src/core/encounter-combat-v3.ts','src/data/game-data.ts','src/data/starter-progression-v3.ts','src/data/encounter-balance-v3.ts','src/data/world-expansion-v3.ts',
 'src/server/world-simulation.ts','src/data/skill-books.ts','src/server/book-system.ts','src/data/p2-encounters.ts','scripts/world_expansion_v3/balance.mjs'].map(path=>({path,sha256:hash(path)}));
 return {schema:1,contract:ENCOUNTER_BALANCE_V3,source,summary,limitedRuntimeMovement:P2_MOVEMENT_V3,
  baseline:Array.from({length:90},(_,i)=>({level:i+1,...baseEncounterStatsV3(i+1),xp:baseXpV3(i+1),gold:baseGoldV3(i+1)})),
  assumptions:{notRuntime:true,damage:'live accuracy and class/equipment formulas; proposed DEF/MDEF helper vs current mode',
   skillModel:'permitted auto-attacks only; old CLASSES.skills rejected by live intent. Books are separate.',noLevelPenalty:true,
   referenceGear:'starter fixtures + live base 10..29 + explicit staged 30/50/70 fixtures; no mandatory legendary rings',
   estimatedCosts:'whole bottles, full HP restoration over ten kills; level-up refill separately amortized, no loot sale credit'},
  candidateRows:rows,currentRows,species,minis,underlevel,firstHunt,pairStress,
  generatorGates:FIRST_HUNTING_GENERATOR_GATES_V3,bookStress,percentHpStress,mage40Stress,actualMiniBookStress};
}
export function renderBalanceReport(result){
 const report=['# Баланс V3 — расчётный кандидат\n',
 '**Это арифметический анализ, не пройденный баланс всей карты.** Первые пять подключены отдельно в ограниченном P2; остальные профили остаются кандидатами.\n',
 'P2 locomotion override `'+result.limitedRuntimeMovement.version+'`: слизень1.5, крыса1.9, жук1.6м/с; гончий4.7, кабан без изменения. HP/ATK/DEF не пересчитаны. Таблицы ниже сохраняют оценочную контактную модель; реальное преследование и серии боя измеряются отдельно.\n',
 '## Контрольные числа\n','```json',JSON.stringify(result.summary,null,2),'```\n',
 'Таблица ниже: обычная базовая цель, соответствующий уровень, +3; активная контактная модель. Значения вне целевых диапазонов остаются видимыми.\n',
 '| L | HP / ATK / DEF | Рыцарь TTK | Маг | Рейнджер | Ассасин | Некро | Максимум расходов / золото |',
 '|---:|---|---:|---:|---:|---:|---:|---:|'];
 for(const level of [1,5,9,10,15,20,29,30,40,49,50,60,69,70,80,90]){
  const b=result.baseline[level-1],rows=result.candidateRows.filter(r=>r.level===level&&r.plus===3);
  report.push('| '+level+' | '+b.hp+' / '+b.atk+' / '+b.def+' | '+['knight','mage','ranger','assassin','necro'].map(c=>rows.find(r=>r.classId===c).ttk.toFixed(1)).join(' | ')+' | '+(Math.max(...rows.map(r=>r.fullRestorationTen.ratio))*100).toFixed(1)+'% |');
 }
 report.push('\n## Герой 15 против голема\n','| Цель / L | Класс | Расчётный TTK | Потеря HP | HP героя | Попаданий контрприёма до смерти |','|---|---|---:|---:|---:|---:|');
 for(const r of result.underlevel)report.push('| '+r.target+' / '+r.targetLevel+' | '+r.classId+' | '+r.ttk+' | '+r.netHpLoss+' | '+r.maxHp+' | '+r.fullHpCounterHitsToKill+' |');
 report.push('\n**Anti-farm не принят:** идеально безопасный кайт без настоящего дальнего ответа остаётся возможен в арифметике. Таблица показывает цену попаданий, а не доказательство того, что AI попадёт.\n');
 report.push('## Первый образец P2, MOB-01…05\n',
  'Все уровни каждого вида, пять классов, +0/+3: '+result.summary.firstHuntCases+' одиночных расчётов; дополнительно 95 без брони и 25 расчётов пары гончих. Это не завершённые бои в игровом клиенте.\n',
  '| Вид | TTK +0, min…max | Максимальная потеря HP за одну цель +0 | Максимум расходов с амортизацией level-up +0 |',
  '|---|---:|---:|---:|');
 for(const m of result.firstHunt){const rows=m.rows.filter(r=>r.plus===0);report.push('| '+m.mobId+' | '+Math.min(...rows.map(r=>r.ttk)).toFixed(2)+'…'+Math.max(...rows.map(r=>r.ttk)).toFixed(2)+' | '+Math.max(...rows.map(r=>r.netHpLoss)).toFixed(2)+' | '+(Math.max(...rows.map(r=>r.progressionAmortizedTen.ratio))*100).toFixed(1)+'% |');}
 report.push('\nРанний +0 имеет запас HP на серию встреч, но расходы не закрыты одним этим фактом. Полный starter здесь — контрольный комплект, а не обещание выдачи всех шести вещей при создании героя; сценарий первых квестов проверяется отдельно. До10 нет книг. +3 не требуется для допуска к стартовым квестам.\n',
  '## Незакрытые отклонения\n','| Класс / L | Проверка | Значение |','|---|---|---:|');
 for(const r of result.candidateRows.filter(r=>r.plus===3&&!r.ttkWithinTarget))report.push('| '+r.classId+' / '+r.level+' | Базовая цель, TTK | '+r.ttk+' с |');
 for(const r of result.candidateRows.filter(r=>r.plus===3&&r.fullRestorationTen.ratio>.4))report.push('| '+r.classId+' / '+r.level+' | Полное восстановление 10 боёв / золото | '+(r.fullRestorationTen.ratio*100).toFixed(1)+'% |');
 report.push('\n## Действующий BookSystem: отдельный стресс\n',
  'Одинаковая цель10000 HP, благоприятная дистанция1,8 м, свободный LOS, фиксированный RNG0,5, полный набор существующих книг по уровню. Урон книг проходит действующий код; автоатаки усреднены. Входящий урон и реальная геометрия не моделируются. Результат не является балансом мини/питов.\n',
  '| L | Рыцарь | Маг | Рейнджер | Ассасин | Некро |','|---:|---:|---:|---:|---:|---:|');
 for(const l of [40,60,90])report.push('| '+l+' | '+['knight','mage','ranger','assassin','necro'].map(c=>result.bookStress.find(r=>r.level===l&&r.classId===c).ttk).join(' | ')+' |');
 report.push('\nОдин неизменённый голем книги некроманта40, без автоатак: '+result.percentHpStress.map(r=>r.target.replace('percent-hp-','')+' HP → '+r.ttk+' с').join('; ')+'. Увеличение HP не удлиняет этот благоприятный сценарий.\n',
  'Маг40 на той же цели/экипировке: книги до39 — '+result.mage40Stress[0].ttk+' с; с действующей книгой40 — '+result.mage40Stress[1].ttk+' с. Книги не изменены. Новые ограничения процентного урона или сопротивления боссов требуют отдельного решения.\n',
  'Мини: '+result.summary.miniAutoTtkFailures+'/60 автоатакующих сценариев вне исходных диапазонов. Их значения и 15 отдельных сценариев с реальным BookSystem остаются в BALANCE_DATA.json. Крупные четыре и награда cave40 этим расчётом не изменяются.\n');
 return report.join('\n').trimEnd()+'\n';
}
export function writeBalance(out=resolve('docs/world-expansion-v3'),{check=false}={}){
 const result=generateBalance();
 const files={'BALANCE_DATA.json':JSON.stringify(result,null,2)+'\n','BALANCE_RESULTS.md':renderBalanceReport(result)};
 if(!check)mkdirSync(out,{recursive:true});
 for(const [name,value]of Object.entries(files)){
  const path=resolve(out,name);
  if(check){if(readFileSync(path,'utf8')!==value)throw Error('Stale generated balance artifact: '+name);}
  else writeFileSync(path,value);
 }
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=writeBalance(undefined,{check:process.argv.includes('--check')});console.log(JSON.stringify(result.summary));
}
