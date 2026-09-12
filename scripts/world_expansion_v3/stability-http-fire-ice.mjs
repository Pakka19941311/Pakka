import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {startWorldServer} from '../../server/http-server.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
import {prepareNativeLineFixture} from './p2-native-line-fixture.mjs';
import {installStabilityProbe} from './stability-probe.mjs';

// Full, real-time server + actual HTTP input and SSE. Only the existing disposable
// native hero fixtures relocate a character; no monster, geometry or clock edits.
const output=resolve(process.argv[2]);mkdirSync(output,{recursive:false});
const geography=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const service=startWorldServer({database:join(output,'world.sqlite'),finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,port:0,beta:true});
const finish=installStabilityProbe(service,output),abort=new AbortController(),rows=[],events=[],packets=[];
let snapshot,sequence=0,streamTask,token,p;
const wait=async(predicate,ms=12000)=>{const end=performance.now()+ms;while(!predicate()&&performance.now()<end)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'real-time condition exceeded '+ms+'ms');};
try{
 if(!service.server.listening)await once(service.server,'listening');
 const url='http://127.0.0.1:'+service.server.address().port;
 const created=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Stability HTTP','classId':'ranger'})});
 assert.equal(created.status,201);const session=await created.json();token=session.token;p=service.world.state.characters[session.snapshot.character.id];
 const response=await fetch(url+'/api/stream',{headers:{Authorization:'Bearer '+token},signal:abort.signal});assert.equal(response.status,200);
 streamTask=(async()=>{let text='';const decoder=new TextDecoder();for await(const bytes of response.body){text+=decoder.decode(bytes,{stream:true});let split;while((split=text.indexOf('\n\n'))>=0){const part=text.slice(0,split);text=text.slice(split+2);if(!part.startsWith('data: '))continue;snapshot=JSON.parse(part.slice(6));packets.push({wall:performance.now(),time:snapshot.time,generation:snapshot.character.generation});events.push(...snapshot.events);}}})();
 const input=async intent=>{const at=performance.now(),n=++sequence;const r=await fetch(url+'/api/input',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sequence:n,generation:p.generation,intent})});assert.equal(r.status,200);const ack=await r.json();assert.equal(ack.sequence,n);rows.push({kind:'input',sequence:n,intent,ackMs:performance.now()-at});};
 await wait(()=>snapshot);
 for(const stage of ['p2-line-fire','p2-line-ice-dodge']){
  const f=prepareNativeLineFixture(service.world,geography,p,stage);service.world.checkpoint();
  await wait(()=>snapshot?.character.generation===f.generation);
  const receivedAt=packets.length;await input({type:'destination',x:f.engagePoint.x,z:f.engagePoint.z});
  await wait(()=>Math.hypot(p.x-f.engagePoint.x,p.z-f.engagePoint.z)<.3||snapshot.groundEffects.some(e=>e.kind==='line'&&e.owner===f.targetUid),6000);
  await input({type:'attack',entityId:f.targetUid,mode:'single',skill:null});
  await wait(()=>snapshot.groundEffects.some(e=>e.kind==='line'&&e.owner===f.targetUid),6000);
  const line=snapshot.groundEffects.find(e=>e.kind==='line'&&e.owner===f.targetUid),before=p.hp,oldEvents=events.length;
  if(stage.endsWith('dodge'))await input({type:'destination',x:f.sidestep.x,z:f.sidestep.z});
  await wait(()=>events.slice(oldEvents).some(e=>e.kind==='release'&&e.actor===f.targetUid&&e.attackKind==='aimed-line'),3000);
  await new Promise(r=>setTimeout(r,250));
  const targetHits=events.slice(oldEvents).filter(e=>e.kind==='hit'&&e.actor===f.targetUid&&e.target===p.id);
  assert.equal(targetHits.length,stage.endsWith('dodge')?0:1);
  if(stage.endsWith('dodge'))assert.equal(p.hp,before);
  const history=packets.slice(receivedAt),gaps=history.slice(1).map((row,i)=>row.wall-history[i].wall);
  rows.push({stage,population:f.population,generation:f.generation,target:f.targetUid,line,snapshots:history.length,maxPacketGapMs:Math.max(0,...gaps),hpBefore:before,hpAfter:p.hp,targetHits});
 }
 const fire=service.world.state.monsters.filter(m=>m.id==='fire_golem'&&m.targetId===p.id);
 assert.equal(fire.length,0,'stale fire targets must release after ice relocation');
 await new Promise(r=>setTimeout(r,8000));
 const gap=Math.max(...packets.slice(1).map((packet,i)=>packet.wall-packets[i].wall));
 rows.push({kind:'post-transfer-observation',maximumSnapshotGapMs:gap});
 assert.ok(gap<5000,'server must continue streaming within the existing client silence deadline');
 writeFileSync(join(output,'report.json'),JSON.stringify({ok:true,rows,packets:packets.length,method:'Actual HTTP + full population + authoritative 60Hz; native rendering is a separate gate.'},null,2));
 console.log(JSON.stringify({ok:true,rows,packets:packets.length}));
}finally{
 abort.abort();await streamTask?.catch(error=>{if(error.name!=='AbortError')throw error;});finish();await service.close();
}
