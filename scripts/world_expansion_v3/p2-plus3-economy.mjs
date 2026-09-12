import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRouteContext} from './p2-quest-routes.mjs';
import {enduranceDriver,ENDURANCE_CASES} from './p2-endurance.mjs';
import {kiteFight} from './p2-caster-style.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=n=>Number(n.toFixed(3));
const potionCount=s=>s.potions.reduce((n,item)=>n+item.count,0);
const kept=id=>['potion','potion_large','ether','haste','teleport'].includes(id)||id.startsWith('starter_')||id.startsWith('book_');

export function runPlus3Case(context,recipe,{driverFactory=enduranceDriver}={}){
 const d=driverFactory(context,{...recipe,plus:3}),initial=d.snapshot();
 const referenceEquipment=structuredClone(d.p().equipment),referenceStats=structuredClone(d.p().stats);
 const ranged=['mage','ranger','necro'].includes(recipe.classId),battles=[],used=new Set(),sales=[];
 let provisioned=null,provisionPurchases=0,failure=null,recoveryFailure=null,saleRevenue=0;
 try{
  d.walk(context.geography.services['npc:shop']);for(let i=0;i<3;i++)d.buy('potion');
  provisioned=d.snapshot();provisionPurchases=d.purchases.length;
  for(let i=0;i<10;i++){
   const mobId=recipe.mobs[i%recipe.mobs.length];
   const targets=d.sim.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId&&!used.has(m.uid)&&d.approach(m));
   targets.sort((a,b)=>Math.abs(a.level-recipe.targetLevel)-Math.abs(b.level-recipe.targetLevel)||distance(a,d.p())-distance(b,d.p()));
   const target=targets[0];if(!target)throw Error('plus3-no-target:'+mobId);
   d.walk(d.approach(target));used.add(target.uid);
   const battle=ranged?kiteFight(context,d,target):d.fight(target);battles.push(battle);
   console.log(JSON.stringify({case:recipe.id,classId:recipe.classId,plus:3,fight:i+1,targetLevel:target.level,hp:d.p().hp,gold:d.p().gold,seconds:battle.seconds,damage:battle.damageTaken,killed:battle.killed}));
   if(!battle.killed||d.p().dead)throw Error(d.p().dead?'plus3-death':'plus3-timeout');
  }
 }catch(error){failure=String(error);}
 const afterHunt=d.snapshot(),loot=d.events.filter(e=>e.kind==='loot'&&e.actor===d.id);
 const huntGold=loot.reduce((n,e)=>n+(e.gold??0),0),huntXp=loot.reduce((n,e)=>n+(e.xp??0),0);
 const huntUses=d.healing.length;
 let atShop=null,beforeSale=null,afterSale=null,afterRecovery=null;
 if(!d.p().dead)try{
  d.walk(context.geography.services['npc:smith']);beforeSale=d.snapshot();
  const trade=d.command({type:'tradeOpen',npcId:'npc:smith'}).outcome;
  for(const item of [...d.p().inventory].filter(item=>!kept(item.id))){
   const gold=d.p().gold;d.command({type:'sell',item:{...item},quantity:item.count,trade:{npcId:trade.npcId,token:trade.token}});
   const revenue=d.p().gold-gold;saleRevenue+=revenue;sales.push({id:item.id,count:item.count,gold:revenue,at:d.sim.state.time});
  }
  afterSale=d.snapshot();d.walk(context.geography.services['npc:shop']);atShop=d.snapshot();
  // Real inventory/use/buy commands; idle time itself never restores HP.
  while(d.p().hp<d.p().maxHp){
   if(!d.heal()){if(d.p().gold<55)throw Error('plus3-insufficient-recovery-gold');d.buy('potion');}
   d.tick(1500);
  }
  afterRecovery=d.snapshot();
  while(potionCount(d.snapshot())<3){if(d.p().gold<55)throw Error('plus3-insufficient-restock-gold');d.buy('potion');}
 }catch(error){recoveryFailure=String(error);}
 const final=d.snapshot(),potionPurchases=d.purchases;
 const startupStockCost=potionPurchases.slice(0,provisionPurchases).reduce((n,p)=>n+p.cost,0);
 const repeatRoutePotionSpend=potionPurchases.slice(provisionPurchases).reduce((n,p)=>n+p.cost,0);
 const totalPotionSpend=startupStockCost+repeatRoutePotionSpend,grossRealizedGold=huntGold+saleRevenue;
 const inventory=structuredClone(d.p().inventory);
 const comparableEnd=Boolean(provisioned)&&final.hp===final.maxHp&&final.mp===initial.mp&&potionCount(final)>=potionCount(provisioned);
 return {...recipe,plus:3,style:ranged?'actual-shot-then-move':'actual-melee-auto',initial,provisioned,referenceEquipment,referenceStats,
  afterHunt,beforeSale,afterSale,atShop,afterRecovery,final,finalInventory:inventory,battles,failure,recoveryFailure,comparableEnd,
  population:d.sim.state.monsters.length,huntGold,huntXp,grossRealizedGold,saleRevenue,sales,
  potionPurchases,healing:d.healing,huntUses,recoveryUses:d.healing.length-huntUses,startupStockCost,repeatRoutePotionSpend,totalPotionSpend,
  firstTripCashNet:final.gold-initial.gold,repeatRouteCashNet:provisioned?final.gold-provisioned.gold:null,
  actualRepeatRecoveryRatio:grossRealizedGold?repeatRoutePotionSpend/grossRealizedGold:null,
  actualRepeatBaseGoldRatio:huntGold?repeatRoutePotionSpend/huntGold:null,
  repeatRouteWithin40:comparableEnd&&grossRealizedGold>0&&repeatRoutePotionSpend/grossRealizedGold<=.4,
  deaths:d.events.filter(e=>e.kind==='death'&&e.actor===d.id).length,
  walkedMetres:round(d.walked),elapsedSeconds:round((d.sim.state.time-initial.at)/1000),movementTrace:d.trace,
  method:'One initial level/reference-equipment+3 fixture at the real spawn, no subsequent resource or monster reset; XP x1. Three actual potions bought before route. Ten real fights; ranged classes move only after server release. Actual return, authorized merchant sale, potion buy/use, full recovery and restock to at least the starting three bottles. Startup stock capital is reported separately from actual repeat-route replenishment spending; no hypothetical healing charges.'};
}

export function runPlus3Economy({only}={}){
 const sources=['scripts/world_expansion_v3/p2-plus3-economy.mjs','scripts/world_expansion_v3/p2-endurance.mjs','scripts/world_expansion_v3/p2-caster-style.mjs','scripts/world_expansion_v3/p2-combat-smoke.mjs','scripts/world_expansion_v3/p2-quest-routes.mjs','src/server/world-simulation.ts','src/data/p2-encounters.ts','src/data/starter-progression-v3.ts','src/core/game-rules.ts','src/core/equipment-stats.ts','src/data/game-data.ts','src/world/final-world.ts'];
 const hashSources=()=>sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
 const sourceHashes=hashSources(),context=makeRouteContext();
 const cases=ENDURANCE_CASES.filter(r=>r.id!=='END-06'&&(!only||r.classId===only)).map(r=>runPlus3Case(context,r));
 return {schema:1,mapVersion:context.geography.mapVersion,populationVersion:context.geography.populationPlan.version,populationDigest:context.geography.populationPlan.digest,sourceHashes,sourcesChangedDuringRun:JSON.stringify(sourceHashes)!==JSON.stringify(hashSources()),cases};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7),report=runPlus3Economy({only});
 writeFileSync('docs/world-expansion-v3/P2_PLUS3_ECONOMY'+(only?'-'+only:'')+'.json',JSON.stringify(report,null,2)+'\n');
 if(report.sourcesChangedDuringRun||report.cases.some(c=>c.failure||c.recoveryFailure))process.exitCode=1;
}
