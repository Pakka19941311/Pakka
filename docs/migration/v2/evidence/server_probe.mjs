import {performance} from 'node:perf_hooks';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir,cpus} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=resolve(process.argv[2]);
const out=resolve(process.argv[3]);
const moduleAt=relative=>import(pathToFileURL(join(repo,relative)).href);
const {WorldStore}=await moduleAt('server/world-store.mjs');
const {WorldSimulation}=await moduleAt('src/server/world-simulation.ts');
const {restoreWorldTopology}=await moduleAt('src/world/world-topology.ts');
const topology=JSON.parse(readFileSync(join(repo,'public/assets/world/world-topology.json'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'varendor-probe-'));
const stats=a=>{const s=[...a].sort((x,y)=>x-y);const p=q=>s[Math.min(s.length-1,Math.ceil(q*s.length)-1)];return {n:s.length,p50_ms:p(.5),p95_ms:p(.95),p99_ms:p(.99),max_ms:s.at(-1)};};
const rows=[];
for(const n of [1,10,30]){
 let serial=0,clock=1_000_000,rng=12345;
 const rand=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 const {collision,terrain}=restoreWorldTopology(topology);
 const store=new WorldStore(join(temp,`world-${n}.sqlite`));
 const world=new WorldSimulation({store,collision,terrain,now:clock,identifier:()=>`probe-${n}-${++serial}`,random:rand,beta:false});
 const ids=Array.from({length:n},(_,i)=>world.createCharacter(`Probe${i}`,'knight').id);
 const tick=[],broadcast=[],combined=[],saves=[];let bytes=0;
 const rawSave=store.save.bind(store);store.save=state=>{const at=performance.now();rawSave(state);saves.push(performance.now()-at);};
 for(let i=0;i<500;i++){
  clock+=50;
  for(const id of ids)world.heartbeat(id);
  const at=performance.now();world.advance(clock);const after=performance.now();
  let payloadBytes=0;
  if(i%2===0)for(const id of ids)payloadBytes+=Buffer.byteLength(JSON.stringify(world.snapshot(id)));
  const end=performance.now();
  if(i>=100){tick.push(after-at);combined.push(end-at);if(i%2===0){broadcast.push(end-after);bytes=payloadBytes;}}
 }
 rows.push({synthetic_characters:n,monster_count:world.state.monsters.length,measured_ticks:400,simulated_seconds:20,motion:'characters idle in spawn; monsters run actual simulation',advance:stats(tick),full_broadcast:stats(broadcast),advance_plus_broadcast:stats(combined),save:stats(saves),last_full_broadcast_bytes:bytes,approx_total_egress_bytes_per_second_at_10hz:bytes*10});
 store.close();
}
const report={kind:'isolated synchronous microbenchmark, not live load test or gameplay FPS',date:'2026-09-07',head:'88838a79c9b544a7918ac1064568d00ed4d57be4',node:process.version,cpu:cpus()[0]?.model,logical_cpus:cpus().length,limitations:['Runs as fast as possible, synthetic time, not wall-clock scheduling','No HTTP/SSE sockets, rendering, player combat, jitter or real clients','Temporary database only; live user saves not read or modified','No claim about user hardware, hosting capacity or cause of video lag'],rows};
writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
