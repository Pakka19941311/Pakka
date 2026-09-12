import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
// All inputs/outputs must be private disposable copies outside Git. Never writes SQLite.
const [serverRoot,worldRoot,heroId,reportName='private-replay.json']=process.argv.slice(2),root=resolve(serverRoot);
const {FinalWorld}=await import(pathToFileURL(join(root,'src/world/final-world.ts')));
const {WorldSimulation}=await import(pathToFileURL(join(root,'src/server/world-simulation.ts')));
const db=new DatabaseSync(join(root,'world.sqlite'),{readOnly:true});
const saved=JSON.parse(db.prepare('SELECT state FROM world WHERE id=1').get().state);db.close();
const store={load:()=>structuredClone(saved),save:()=>{},receipt:()=>null,imported:()=>null};
const geography=new FinalWorld(resolve(worldRoot),true,{populationMode:'starter-v3'});
const sim=new WorldSimulation({store,finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,now:saved.time,identifier:()=>crypto.randomUUID(),random:()=>.5,beta:true});
let totals={},slow=[];const methods=['tick','monsterTick','waypoint','lineOfSight','move','separateActors','expireDeadlines'];
function wrap(object,name,label=name){const original=object[name];object[name]=function(...args){const at=performance.now();try{return original.apply(this,args);}finally{const ms=performance.now()-at,row=totals[label]??={count:0,ms:0,max:0};row.count++;row.ms+=ms;row.max=Math.max(row.max,ms);if(ms>20&&label==='waypoint')slow.push({label,ms,actor:args[3],from:args[0],goal:args[1]});}};}
for(const name of methods)wrap(sim,name);
wrap(geography.spaces.surface.collision,'resolve','staticResolve');wrap(geography.spaces.surface.terrain,'supportAt');
const started=performance.now(),rows=[];
for(let i=0;i<600;i++){
 sim.heartbeat(heroId);totals={};const at=performance.now();sim.advance(sim.state.time+1000/60+.00001);
 rows.push({i,wallMs:performance.now()-at,time:sim.state.time,totals});
 if(performance.now()-started>20000)break;
}
const result={elapsedMs:performance.now()-started,completedTicks:rows.length,population:sim.state.monsters.length,heroes:Object.keys(sim.state.characters).length,supportSurfaces:geography.spaces.surface.terrain.surfaces.length,
 rows,slow,finalState:sim.state};
if(!/^[a-zA-Z0-9_-]+\.json$/.test(reportName))throw Error('report name must be a local JSON filename');
writeFileSync(join(root,reportName),JSON.stringify(result,null,2),{flag:'wx'});
const summary={elapsedMs:result.elapsedMs,completedTicks:rows.length,population:result.population,supportSurfaces:result.supportSurfaces,worst:rows.toSorted((a,b)=>b.wallMs-a.wallMs).slice(0,3),slowPaths:slow.length};
console.log(JSON.stringify(summary));
