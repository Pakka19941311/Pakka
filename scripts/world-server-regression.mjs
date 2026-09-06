// A dedicated process and two HTTP clients exercise the new server boundary only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { randomUUID } from 'node:crypto';

const directory=await mkdtemp(join(tmpdir(),'varendor-process-'));
const database=join(directory,'world.sqlite');
const report={block:'part1-server',sha:process.env.GITHUB_SHA??'local-working-tree',passed:false,checks:[],errors:[]};
let processHandle;let base;
async function launch(){
  const entry=pathToFileURL(resolve('server/http-server.mjs')).href;
  const collisions=pathToFileURL(resolve('src/world/collision-world.ts')).href;
  const code=`import {startWorldServer} from ${JSON.stringify(entry)};import {CollisionWorld} from ${JSON.stringify(collisions)};
    const running=startWorldServer({database:${JSON.stringify(database)},collision:new CollisionWorld(),port:0,beta:true});
    running.server.once('listening',()=>console.log('READY '+running.server.address().port));
    process.once('SIGTERM',()=>void running.close().then(()=>process.exit(0)));`;
  processHandle=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  let output='';let errors='';processHandle.stderr.on('data',data=>{errors+=data;});
  base=await new Promise((resolveReady,reject)=>{
    const timeout=setTimeout(()=>reject(Error('server-start-timeout: '+errors)),10_000);
    processHandle.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/READY (\d+)/);if(match){clearTimeout(timeout);resolveReady(`http://127.0.0.1:${match[1]}`);}});
    processHandle.once('exit',code=>{if(!output.includes('READY')){clearTimeout(timeout);reject(Error(`server-exit-${code}: ${errors}`));}});
  });
}
async function stop(){const done=once(processHandle,'exit');processHandle.kill('SIGTERM');await done;processHandle=null;}
async function api(path,token,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{ })},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  assert.equal(response.ok,true,`${path}: HTTP ${response.status}`);return response.json();
}
const check=name=>{report.checks.push(name);console.log('PASS',name);};
try{
  const store=new WorldStore(database);const w=new WorldSimulation({store,collision:new CollisionWorld(),now:Date.now(),identifier:randomUUID,beta:true});
  const monster=w.state.monsters.find(m=>m.id==='mini');monster.alive=false;monster.hp=0;monster.respawnAt=Date.now()+1000;w.checkpoint();store.close();
  await launch();
  const first=await api('/api/session',null,{name:'Клиент А',classId:'mage'});
  const second=await api('/api/session',null,{name:'Клиент Б',classId:'knight'});
  assert.notEqual(first.snapshot.character.id,second.snapshot.character.id);
  const controls=[new AbortController(),new AbortController()];
  const streams=await Promise.all([first,second].map((client,i)=>fetch(base+'/api/stream',{headers:{Authorization:`Bearer ${client.token}`},signal:controls[i].signal})));
  const readers=streams.map(stream=>stream.body.getReader());
  await Promise.all(readers.map(reader=>reader.read()));
  const shared=await api('/api/world',second.token);
  assert.equal(shared.heroes.length,2);assert.equal(shared.monsters.length,first.snapshot.monsters.length);
  check('two independent clients share the same active server world');
  const before=await api('/api/health');
  // No client simulation or animation runs during this wait.
  await new Promise(resolve=>setTimeout(resolve,1100));
  const after=await api('/api/world',second.token);
  assert.ok(after.time>before.time+850);assert.ok(after.heroes.some(hero=>hero.id===first.snapshot.character.id));
  assert.equal(after.monsters.find(m=>m.id==='mini').alive,true);
  check('world clock and saved respawn deadline advance while a connected client stops reading');
  controls.forEach(c=>c.abort());
  await Promise.allSettled(readers.map(r=>r.cancel()));
  const zeroBefore=await api('/api/health');
  await new Promise(resolve=>setTimeout(resolve,180));
  const zeroAfter=await api('/api/health');assert.ok(zeroAfter.revision>zeroBefore.revision);
  check('server continues ticking after both streams disconnect');
  const current=await api('/api/world',first.token);const command={id:'process-enhancement-1',command:{type:'enhance',item:current.character.equipment.weapon,scroll:current.character.inventory.find(i=>i.id==='weapon_scroll')}};
  const result=await api('/api/command',first.token,command);assert.equal(result.receipt.outcome.to,1);
  await stop();await launch();
  const retry=await api('/api/command',first.token,command);
  assert.deepEqual(retry.receipt,result.receipt);
  assert.equal(retry.snapshot.character.inventory.find(i=>i.id==='weapon_scroll').count,99);
  assert.equal(retry.snapshot.character.equipment.weapon.plus,1);
  assert.equal(retry.snapshot.monsters.find(m=>m.id==='mini').alive,true);
  check('process restart preserves session, world deadline, item and exactly-once receipt');
  report.passed=true;
}catch(error){report.errors.push(error.stack??String(error));throw error;}
finally{
  if(processHandle)await stop();await rm(directory,{recursive:true,force:true});
  await mkdir('qa-artifacts',{recursive:true});await writeFile('qa-artifacts/part1-server.json',JSON.stringify(report,null,2)+'\n');
}
