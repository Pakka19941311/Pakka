// Isolated real-time HTTP/SSE diagnostic. No renderer and no user data.
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startWorldServer } from '../server/http-server.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { WorldStore } from '../server/world-store.mjs';
import { restoreWorldTopology } from '../src/world/world-topology.ts';

const durationMs=60_000, samples={advance:[],snapshot:[],save:[],interval:[],httpHealth:[],sseAge:[]};
let lastTick=null;
let acknowledgeDisconnect;
const disconnected=new Promise(resolve=>{acknowledgeDisconnect=resolve;});
const originalDisconnect=WorldSimulation.prototype.disconnect;
WorldSimulation.prototype.disconnect=function(...args){
  try{return originalDisconnect.apply(this,args);}finally{acknowledgeDisconnect();}
};
for(const [prototype,key,series] of [[WorldSimulation.prototype,'advance','advance'],[WorldSimulation.prototype,'snapshot','snapshot'],[WorldStore.prototype,'save','save']]) {
  const original=prototype[key];
  prototype[key]=function(...args){
    const started=performance.now();
    if(key==='advance'){if(lastTick!==null)samples.interval.push(started-lastTick);lastTick=started;}
    try{return original.apply(this,args);}finally{samples[series].push(performance.now()-started);}
  };
}
const dir=mkdtempSync(join(tmpdir(),'varendor-p0-live-'));
const topology=restoreWorldTopology(JSON.parse(readFileSync('public/assets/world/world-topology.json','utf8')));
const running=startWorldServer({database:join(dir,'synthetic.sqlite'),...topology,port:0,beta:false});
await new Promise(resolve=>running.server.once('listening',resolve));
const base=`http://127.0.0.1:${running.server.address().port}/api`;
const session=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'P0 synthetic probe',classId:'knight'})}).then(r=>r.json());
if(!session.token)throw Error('synthetic-session-failed');
const abort=new AbortController();
const stream=await fetch(base+'/stream',{headers:{Authorization:`Bearer ${session.token}`},signal:abort.signal});
if(!stream.ok)throw Error('stream-failed');
let bytes=0, snapshots=0, remainder='';
const decoder=new TextDecoder();
const reading=(async()=>{
  try{for await(const chunk of stream.body){
    bytes+=chunk.byteLength;remainder+=decoder.decode(chunk,{stream:true});
    let end;
    while((end=remainder.indexOf('\n\n'))>=0){
      const packet=remainder.slice(0,end);remainder=remainder.slice(end+2);
      const line=packet.split('\n').find(line=>line.startsWith('data: '));
      if(line){const state=JSON.parse(line.slice(6));snapshots++;samples.sseAge.push(Date.now()-state.time);}
    }
  }}catch(error){if(!abort.signal.aborted)throw error;}
})();
const loop=monitorEventLoopDelay({resolution:10});loop.enable();
const started=performance.now();
while(performance.now()-started<durationMs){
  const at=performance.now(); const response=await fetch(base+'/health');await response.arrayBuffer();
  if(!response.ok)throw Error('health-failed');
  samples.httpHealth.push(performance.now()-at);
  await new Promise(resolve=>setTimeout(resolve,1000));
}
const elapsed=performance.now()-started;loop.disable();abort.abort();await reading;
// Await the server's actual request-close handler before closing its SQLite handle.
// Baseline close() itself races this handler; the first failed probe records that defect.
let closeTimeout;
try{await Promise.race([disconnected,new Promise((_,reject)=>{closeTimeout=setTimeout(()=>reject(Error('disconnect-not-acknowledged')),5000);})]);}
finally{clearTimeout(closeTimeout);}
await running.close();
const stats=a=>{if(!a.length)return {n:0};const s=[...a].sort((a,b)=>a-b);const p=q=>s[Math.min(s.length-1,Math.ceil(q*s.length)-1)];return {n:s.length,p50_ms:p(.5),p95_ms:p(.95),p99_ms:p(.99),max_ms:s.at(-1)};};
const report={kind:'isolated live loopback HTTP/SSE with one idle synthetic hero; NOT user route, client FPS or hosting load capacity',
  sourceCommit:execFileSync('git',['rev-parse','checkpoint/pre-godot-20260907'],{encoding:'utf8'}).trim(),date:new Date().toISOString(),
  node:process.version,cpu:cpus()[0].model,logicalCpus:cpus().length,elapsedMs:elapsed,
  syntheticCharacters:1,monsters:session.snapshot.monsters.length,snapshots,receivedSseBytes:bytes,
  approximateSseBytesPerSecond:bytes/(elapsed/1000),metrics:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,stats(v)])),
  eventLoopDelay:{p50_ms:loop.percentile(50)/1e6,p95_ms:loop.percentile(95)/1e6,p99_ms:loop.percentile(99)/1e6,max_ms:loop.max/1e6},
  raw:samples,limitations:['No hardware rendering, real user route, camera or combat.','Local health HTTP latency is not the user network RTT.','snapshot measures clone/build; SSE byte count is received body only, not TLS or HTTP overhead.','advance includes synchronous saves; save samples are separately recorded, not additive.','No claim about personal data backup, remote capacity or the cause of the supplied video.']};
writeFileSync('docs/migration/p0/evidence/live-server-probe.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,raw:undefined},null,2));
