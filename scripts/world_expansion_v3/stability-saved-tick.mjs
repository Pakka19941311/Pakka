import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {makeP2Simulation} from './p2-combat-smoke.mjs';
const [database,output]=process.argv.slice(2);
const db=new DatabaseSync(database,{readOnly:true}),state=JSON.parse(db.prepare('SELECT state FROM world WHERE id=1').get().state);db.close();
const sim=makeP2Simulation({now:state.time});sim.state=structuredClone(state);sim.physicsEpoch=state.time;sim.physicsTick=0;
for(const p of Object.values(sim.state.characters))p.activeUntil=state.time+30000;
const rows=[];
for(const name of ['monsterTick','waypoint','lineOfSight','tick','separateActors']){
 const original=sim[name];sim[name]=function(...args){const at=performance.now();try{return original.apply(this,args);}finally{
  const ms=performance.now()-at;if(ms>.1)rows.push({method:name,ms,actor:args[0]?.uid??args[0]?.id,from:args[0]?.x!==undefined?{x:args[0].x,z:args[0].z}:undefined,to:args[1]?.x!==undefined?{x:args[1].x,z:args[1].z}:undefined});
 }};
}
const started=performance.now();sim.advance(state.time+17);
const result={elapsedMs:performance.now()-started,rows:rows.sort((a,b)=>b.ms-a.ms),targets:state.monsters.filter(m=>m.targetId||m.provokedBy).map(m=>({uid:m.uid,target:m.targetId,provoked:m.provokedBy,x:m.x,z:m.z,home:m.home}))};
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({elapsedMs:result.elapsedMs,top:result.rows.slice(0,12),targets:result.targets}));
