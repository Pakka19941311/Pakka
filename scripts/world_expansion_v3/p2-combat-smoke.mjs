import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {FinalWorld} from '../../src/world/final-world.ts';
import {WorldSimulation} from '../../src/server/world-simulation.ts';
import {STARTER_ITEMS} from '../../src/data/starter-progression-v3.ts';
import {p2Encounter} from '../../src/data/p2-encounters.ts';

export class P2MemoryStore{
 saved=null;receipts=new Map();
 load(){return this.saved?structuredClone(this.saved):null;}
 save(state){this.saved=structuredClone(state);}
 receipt(character,id){return this.receipts.get(character+':'+id)??null;}
 commit(state,character,id,_payload,result){this.save(state);this.receipts.set(character+':'+id,result);}
 imported(){return null;}
 commitImport(state){this.save(state);}
}
export const makeP2Geography=()=>new FinalWorld(undefined,true,{populationMode:'starter-v3'});
export function makeP2Simulation({geography=makeP2Geography(),store=new P2MemoryStore(),random=()=>.5,now=1000}={}){
 let serial=0;return new WorldSimulation({store,finalWorld:geography,collision:geography.spaces.surface.collision,
  terrain:geography.spaces.surface.terrain,now,random,identifier:()=>`p2-test-${++serial}`});
}
export function equipP2Reference(simulation,character,level,plus=0){
 character.level=level;character.xp=0;character.inventory=[];character.lootBuffer=[];
 character.equipment=Object.fromEntries(['starter_weapon_'+character.classId,'starter_chest_'+character.classId,
  'starter_head','starter_gloves','starter_boots','starter_belt'].map(id=>[STARTER_ITEMS[id].slot,{uid:'fixture:'+id,id,plus,count:1}]));
 simulation.recalculate(character);character.hp=character.maxHp;character.mp=character.maxMp;
}
export function stepP2(simulation,milliseconds){
 const end=simulation.state.time+milliseconds;
 while(simulation.state.time<end-.001){for(const hero of Object.values(simulation.state.characters))simulation.heartbeat(hero.id);
  simulation.advance(Math.min(end,simulation.state.time+100));}
}
export function runP2Battle({geography=makeP2Geography(),classId,mobId,plus=0,naturalPopulation=false,maxSeconds=90}={}){
 const simulation=makeP2Simulation({geography}),hero=simulation.createCharacter('P2 '+classId,classId);
 const wolves=simulation.state.monsters.filter(m=>m.canonicalMobId==='MOB-02');
 const candidates=simulation.state.monsters.filter(m=>m.canonicalMobId===mobId);
 const midpoint={"MOB-01":2,"MOB-02":7,"MOB-03":2,"MOB-04":4,"MOB-05":8}[mobId];
 const preferred=candidates.filter(m=>m.level===midpoint);
 const targets=(preferred.length?preferred:candidates).sort((a,b)=>{
  const gap=m=>Math.min(...wolves.filter(w=>w.uid!==m.uid).map(w=>Math.hypot(w.x-m.x,w.z-m.z)));
  return gap(b)-gap(a)||a.uid.localeCompare(b.uid);
 });
 let target,standing;
 for(const m of targets){
  const radius=['knight','assassin'].includes(classId)?2.25:6;
  for(let i=0;i<32;i++){
   const point={x:m.x+Math.cos(i*Math.PI/16)*radius,z:m.z+Math.sin(i*Math.PI/16)*radius,spaceId:'surface'};
   if(geography.safe(point)||geography.spaces.surface.collision.isBlocked(point,.46)||!simulation.lineOfSight(point,m))continue;
   if(naturalPopulation&&mobId!=='MOB-02'&&wolves.some(w=>Math.hypot(point.x-w.x,point.z-w.z)<8.5))continue;
   target=m;standing=point;break;
  }if(target)break;
 }
 if(!target)throw Error('No actual stand point for '+classId+'/'+mobId);
 if(!naturalPopulation)simulation.state.monsters=[target];
 equipP2Reference(simulation,hero,target.level,plus);Object.assign(hero,standing,{yaw:Math.atan2(target.x-standing.x,target.z-standing.z)});
 simulation.heartbeat(hero.id);
 const start=simulation.state.time,initialHp=hero.hp,initialMp=hero.mp,initialGold=hero.gold;
 simulation.input(hero.id,1,{type:'attack',entityId:target.uid,skill:null,mode:'auto'});
 while(target.alive&&!hero.dead&&simulation.state.time-start<maxSeconds*1000){stepP2(simulation,100);}
 const events=simulation.events,death=events.find(e=>e.kind==='death'&&e.actor===target.uid);
 const hits=events.filter(e=>e.kind==='hit'&&e.actor===hero.id&&e.target===target.uid);
 const taken=events.filter(e=>e.kind==='hit'&&e.target===hero.id);
 return {classId,mobId,level:target.level,plus,scenario:naturalPopulation?'full-1151-population':'isolated-target-on-real-terrain',
  uid:target.uid,ttk:Number((((death?.at??simulation.state.time)-start)/1000).toFixed(3)),killed:!target.alive,heroDead:hero.dead,
  playerHits:hits.length,damageDealt:hits.reduce((n,e)=>n+e.amount,0),damageTaken:taken.reduce((n,e)=>n+e.amount,0),
  enemyAttackerUids:[...new Set(taken.map(e=>e.actor))],playerReleaseCount:events.filter(e=>e.kind==='release'&&e.actor===hero.id).length,
  initialHp,remainingHp:hero.hp,mpSpent:initialMp-hero.mp,goldGained:hero.gold-initialGold,
  monsterHp:p2Encounter(target).hp,lootEvents:events.filter(e=>e.kind==='loot'&&e.target===target.uid).length,
  population:simulation.state.monsters.length,serverPhysics:true,nativeAnimationValidated:false,
  assumption:'Fixed RNG 0.5, real WorldSimulation 60Hz/navigation/collision/AI/release/projectile/death/loot. No books, no potions, no forced damage.',
  events:events.filter(e=>e.actor===hero.id||e.target===hero.id||e.actor===target.uid||e.target===target.uid)};
}
export function runP2Matrix({includeNatural=true}={}){
 const geography=makeP2Geography(),rows=[];
 for(const classId of ['knight','mage','ranger','assassin','necro'])for(const mobId of ['MOB-01','MOB-02','MOB-03','MOB-04','MOB-05']){
  const result=runP2Battle({geography,classId,mobId});rows.push(result);
  console.log(JSON.stringify({classId,mobId,ttk:result.ttk,killed:result.killed,heroDead:result.heroDead}));
 }
 const naturalRows=[];
 if(includeNatural)for(const [classId,mobId]of [['knight','MOB-01'],['mage','MOB-02'],['ranger','MOB-03'],['assassin','MOB-04'],['necro','MOB-05']]){
  const result=runP2Battle({geography,classId,mobId,naturalPopulation:true});naturalRows.push(result);
  console.log(JSON.stringify({scenario:result.scenario,classId,mobId,ttk:result.ttk,killed:result.killed,heroDead:result.heroDead}));
 }
 return {mode:'starter-v3',balanceVersion:geography.slots.find(s=>s.canonicalMobId).balanceVersion,
  runtimeValidated:'server-only, native animation pending',rows,naturalRows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=runP2Matrix();writeFileSync('docs/world-expansion-v3/P2_COMBAT_RESULTS.json',JSON.stringify(result,null,2)+'\n');
 if([...result.rows,...result.naturalRows].some(r=>!r.killed||r.heroDead))process.exitCode=1;
}
