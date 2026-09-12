import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

/** Opt-in QA observation only. No clock, population, HTTP or simulation policy changes. */
export function installStabilityProbe(service, output) {
 const started=performance.now(),rows=[];let serial=0;
 const record=(kind,extra={})=>rows.push({wallMs:Math.round(performance.now()-started),kind,...extra});
 const originalAdvance=service.world.advance;
 let totals={};const methods=['tick','monsterTick','lineOfSight','move','separateActors','expireDeadlines'];
 const originals=new Map(methods.map(name=>[name,service.world[name]]));
 for(const [name,original] of originals)service.world[name]=function(...args){const at=performance.now();try{return original.apply(this,args);}finally{
  const ms=performance.now()-at,row=totals[name]??={count:0,ms:0,max:0};row.count++;row.ms+=ms;row.max=Math.max(row.max,ms);
 }};
 const originalWaypoint=service.world.waypoint;
 service.world.waypoint=function(...args){const at=performance.now();try{return originalWaypoint.apply(this,args);}finally{
  const ms=performance.now()-at;if(ms>10)record('slow-path',{ms,actor:args[3],from:{x:args[0].x,z:args[0].z},to:{x:args[1].x,z:args[1].z},radius:args[2]});
 }};
 service.world.advance=function(...args){totals={};const at=performance.now();try{return originalAdvance.apply(this,args);}finally{
  const ms=performance.now()-at;if(ms>50)record('slow-advance',{ms,time:this.state.time,totals});
 }};
 const request=(req,res)=>{
  if(!req.url?.startsWith('/api/stream'))return;
  const id=++serial;record('stream-open',{id});
  const write=res.write;res.write=function(chunk,...args){
   const result=write.call(this,chunk,...args);
   record('stream-write',{id,bytes:Buffer.byteLength(chunk),ready:result,buffer:this.writableLength,time:service.world.state.time,
    heroes:Object.values(service.world.state.characters).map(p=>({id:p.id,generation:p.generation,sequence:p.lastInputSequence,x:p.x,z:p.z}))});
   return result;
  };
  res.on('drain',()=>record('stream-drain',{id,buffer:res.writableLength}));
  res.on('close',()=>record('stream-close',{id,buffer:res.writableLength}));
  req.on('close',()=>record('request-close',{id}));
 };
 service.server.on('request',request);
 return ()=>{service.server.off('request',request);service.world.advance=originalAdvance;service.world.waypoint=originalWaypoint;for(const [name,original] of originals)service.world[name]=original;writeFileSync(join(output,'server-stability.json'),JSON.stringify({rows},null,2));};
}
