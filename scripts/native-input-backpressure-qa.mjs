import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const [python,godot,outputArg]=process.argv.slice(2);
if(!python||!godot||!outputArg) throw Error('Usage: node scripts/native-input-backpressure-qa.mjs <python> <Godot> <new-output-dir>');
const output=resolve(outputArg);mkdirSync(output,{recursive:true});
const trace=[];let generation=1,lastSequence=0;
const snapshot=()=>({protocol:1,time:2000,revision:2000,events:[],heroes:[],monsters:[],character:{id:'qa-input-backpressure',generation,x:40,z:-20,yOffset:0,grounded:true,yaw:0,verticalVelocity:0,lastInputSequence:lastSequence,lastInputAt:2000,dead:false,stats:{speed:6.2},combatState:'idle',action:'idle',actionStartedAt:2000,destination:null,target:null}});
const server=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){res.writeHead(413).end();return;}}
 const payload=JSON.parse(raw||'{}'),arrived=Date.now();
 const send=value=>{if(!res.destroyed)res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));};
 if(req.url==='/api/input'){
  const accepted=payload.generation===generation&&payload.sequence>lastSequence;
  if(accepted)lastSequence=payload.sequence;
  trace.push({path:req.url,arrived,accepted,payload});
  setTimeout(()=>send(accepted?{sequence:payload.sequence}:{error:'stale synthetic generation/sequence'}),120);
 }else if(req.url==='/api/command'&&payload.command?.type==='teleport'){
  trace.push({path:req.url,arrived,payload:{command:payload.command}});
  generation=2;setTimeout(()=>send({receipt:{id:payload.id,ok:true,outcome:{destination:'synthetic-forest'}},snapshot:snapshot()}),20);
 }else {res.writeHead(404).end('{}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const sourceFiles=['network','input_transport','player_input','player_movement','camera_controller','dialog_lease','book_ui','interface_polish','main','reference_hud','trade_session','sale_dialog','crafting_dialog','starter_quests','progression_quests','native_input_backpressure_qa','dialog_lifecycle_qa','network_intent_qa','network_qa'].map(name=>`godot-pc/scripts/${name}.gd`);
writeFileSync(join(output,'sources.json'),JSON.stringify(Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),null,2));
const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(godot),'--project','godot-pc','--output',join(output,'native'),'--qa-user-root',join(output,'isolated-user'),'--timeout','25','--','--headless','--script','res://scripts/native_input_backpressure_qa.gd','--',`--input-qa-url=${url}`,`--input-qa-output=${join(output,'input.json')}`];
const child=spawn(python,args,{stdio:'inherit',windowsHide:true});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
writeFileSync(join(output,'transport.json'),JSON.stringify({delayMs:120,syntheticReceiver:true,trace},null,2));
let report;try{report=JSON.parse(readFileSync(join(output,'input.json'),'utf8'));}catch{}
const accepted=trace.filter(row=>row.path==='/api/input'&&row.accepted);
const generation2=accepted.filter(row=>row.payload.generation===2);
const checks={nativePassed:exitCode===0&&report?.ok===true,strictSequenceOrder:accepted.every((row,i)=>i===0||row.payload.sequence>accepted[i-1].payload.sequence),postTeleportNeutral:generation2.length===1&&generation2[0].payload.intent.x===0&&generation2[0].payload.intent.z===0};
writeFileSync(join(output,'summary.json'),JSON.stringify({ok:Object.values(checks).every(Boolean),checks,requests:accepted.length,nativeChecks:report?.checks,releaseAckWallMs:report?.release_ack_wall_ms,maxPending:report?.max_pending_directions,maxUnsent:report?.max_unsent_directions},null,2));
if(!Object.values(checks).every(Boolean))process.exitCode=1;
