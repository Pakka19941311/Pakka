import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRouteContext} from './p2-quest-routes.mjs';
import {enduranceDriver} from './p2-endurance.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {p2Encounter} from '../../src/data/p2-encounters.ts';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=n=>Number(n.toFixed(3));
function restCase(context,classId,level,mobId){
 const d=enduranceDriver(context,{classId,level,seed:300+level}),initial=d.snapshot();
 const target=d.sim.state.monsters.filter(m=>m.canonicalMobId===mobId&&m.level===level&&d.approach(m)).sort((a,b)=>distance(a,d.p())-distance(b,d.p()))[0];
 d.walk(d.approach(target));const battle=d.fight(target);if(!battle.killed||d.p().hp===d.p().maxHp)throw Error('rest-needs-real-wound');
 d.walk(context.geography.services['npc:elder']);const beforeRest=d.snapshot(),safe=context.geography.safe(d.p()),samples=[];
 for(let i=0;i<120;i++){d.tick(1000);if(i%10===9)samples.push(d.snapshot());}
 let legacySkillError;try{d.input({type:'attack',entityId:target.uid,skill:1,mode:'single'});}catch(error){legacySkillError=error.message;}
 return {classId,level,initial,battle,safe,beforeRest,afterRest:d.snapshot(),samples,legacySkillError,healing:d.healing,purchases:d.purchases,
  population:d.sim.state.monsters.length,walkedMetres:round(d.walked),method:'One initial fixture; actual wound from real battle; normal movement to Roen; 120 active seconds idle without use/fixture/teleport.'};
}
function maneuver(context,d,m){
 const choices=[];
 for(const radius of [6,7.5,8.5])for(let i=0;i<40;i++){
  const q={x:m.home.x+Math.cos(i*Math.PI/20)*radius,z:m.home.z+Math.sin(i*Math.PI/20)*radius,spaceId:'surface'},step=distance(q,d.p());
  if(step<2.8||step>6||context.geography.safe(q)||context.graph.nodeFor(q)===undefined||distance(q,m)>9||!d.sim.lineOfSight(q,m))continue;
  if(!pathSegmentIsClear(context.collision,d.p(),q,.46))continue;
  choices.push({q,score:distance(q,m)-step*.12});
 }
 return choices.sort((a,b)=>b.score-a.score)[0]?.q;
}
export function kiteFight(context,d,m){
 const before=d.snapshot(),initialMonsterHp=m.hp,startSequence=d.sim.state.sequence,movement=[],distances=[];
 while(m.alive&&!d.p().dead&&d.sim.state.time-before.at<120000){
  const sequence=d.sim.state.sequence;d.input({type:'attack',entityId:m.uid,skill:null,mode:'single'});let released=false;
  for(let i=0;i<60&&m.alive;i++){
   d.tick(100);distances.push(distance(d.p(),m));
   released=d.events.some(e=>e.sequence>sequence&&e.kind==='release'&&e.actor===d.id&&e.target===m.uid);
   if(released)break;
  }
  if(!released&&m.alive)throw Error('kite-release-timeout');if(!m.alive)break;
  const q=maneuver(context,d,m);
  if(q){const from={x:d.p().x,z:d.p().z,at:d.sim.state.time};d.walkSegment(q);movement.push({from,to:{x:d.p().x,z:d.p().z,at:d.sim.state.time},targetDistance:distance(d.p(),m)});}
  else d.tick(250);
  if(d.p().hp<d.p().maxHp*.4)d.heal();
 }
 d.stop();const during=d.events.filter(e=>e.sequence>startSequence);
 return {uid:m.uid,mobId:m.canonicalMobId,level:m.level,initialMonsterHp,maxHp:p2Encounter(m).hp,before,after:d.snapshot(),killed:!m.alive,
  seconds:round((d.sim.state.time-before.at)/1000),damageTaken:during.filter(e=>e.kind==='hit'&&e.target===d.id).reduce((n,e)=>n+e.amount,0),
  movement,meanTargetDistance:round(distances.reduce((n,x)=>n+x,0)/distances.length),
  releases:during.filter(e=>e.kind==='release'&&e.actor===d.id).length,loot:during.filter(e=>e.kind==='loot'&&e.target===m.uid)};
}
function series(context,{classId,level,mobs,seed}){
 const d=enduranceDriver(context,{classId,level,seed}),initial=d.snapshot(),used=new Set(),battles=[];let failure=null;
 try{
  d.walk(context.geography.services['npc:shop']);for(let i=0;i<3;i++)d.buy('potion');
  for(let i=0;i<10;i++){
   const mobId=mobs[i%mobs.length],targets=d.sim.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId&&!used.has(m.uid)&&d.approach(m));
   targets.sort((a,b)=>Math.abs(a.level-level)-Math.abs(b.level-level)||distance(a,d.p())-distance(b,d.p()));const target=targets[0];
   if(!target)throw Error('kite-no-target');d.walk(d.approach(target));used.add(target.uid);const result=kiteFight(context,d,target);battles.push(result);
   console.log(JSON.stringify({classId,fight:i+1,hp:d.p().hp,damage:result.damageTaken,seconds:result.seconds}));
   if(!result.killed)throw Error('kite-not-killed');
  }
 }catch(error){failure=String(error);}
 const afterHunt=d.snapshot(),loot=d.events.filter(e=>e.kind==='loot'&&e.actor===d.id),gold=loot.reduce((n,e)=>n+(e.gold??0),0);
 return {classId,level,seed,initial,afterHunt,battles,failure,population:d.sim.state.monsters.length,
  grossGold:gold,grossXp:loot.reduce((n,e)=>n+(e.xp??0),0),cashNet:afterHunt.gold-initial.gold,
  healing:d.healing,purchases:d.purchases,walkedMetres:round(d.walked),elapsedSeconds:round((d.sim.state.time-initial.at)/1000),
  damageTaken:d.events.filter(e=>e.kind==='hit'&&e.target===d.id).reduce((n,e)=>n+e.amount,0),
  method:'Ten consecutive actual single shots and destination maneuvers on real collision. Never override attack clocks; retreat only after a real release. No books, HP reset or buff. Three potions purchased once at start. No mandatory full recovery or material sale.'};
}
export function runCasterStyle({only}={}){
 const sources=['scripts/world_expansion_v3/p2-caster-style.mjs','scripts/world_expansion_v3/p2-endurance.mjs','src/server/world-simulation.ts','src/data/p2-encounters.ts','src/world/final-world.ts','src/data/starter-progression-v3.ts'];
 const hashes=()=>sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),sourceHashes=hashes(),context=makeRouteContext(),rest=[],styles=[];
 if(only!=='style')for(const args of [['mage',3,'MOB-03'],['necro',8,'MOB-05']]){const r=restCase(context,...args);rest.push(r);console.log(JSON.stringify({rest:r.classId,hp:[r.beforeRest.hp,r.afterRest.hp],skill:r.legacySkillError}));}
 if(only!=='rest')for(const recipe of [{classId:'mage',level:3,mobs:['MOB-03','MOB-01'],seed:1102},{classId:'necro',level:8,mobs:['MOB-05'],seed:1105}])styles.push(series(context,recipe));
 return {schema:1,sourceHashes,sourcesChangedDuringRun:JSON.stringify(sourceHashes)!==JSON.stringify(hashes()),mapVersion:context.geography.mapVersion,rest,styles};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7),report=runCasterStyle({only});writeFileSync('docs/world-expansion-v3/P2_CASTER_STYLE'+(only?'-'+only:'')+'.json',JSON.stringify(report,null,2)+'\n');
 if(report.sourcesChangedDuringRun||report.styles.some(c=>c.failure))process.exitCode=1;
}
