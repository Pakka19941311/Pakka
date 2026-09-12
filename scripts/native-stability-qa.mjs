import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {startWorldServer} from '../server/http-server.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {createNativeStabilityFixtureRunner} from './world_expansion_v3/native-stability-fixture.mjs';

const [binaryArg,outputArg,...options]=process.argv.slice(2);
assert.ok(binaryArg&&outputArg,'Usage: node scripts/native-stability-qa.mjs <Godot/exe> <new-output> [--package=dir] [--saved-copy=verified-private.sqlite] [--budget=210] [--qa-user-root=dir]');
const binary=resolve(binaryArg),output=resolve(outputArg);
assert.ok(!existsSync(output),'Use a fresh disposable output directory');mkdirSync(output,{recursive:true});
const option=(name,fallback='')=>options.find(v=>v.startsWith(name+'='))?.slice(name.length+1)??fallback;
const packageDir=option('--package'),sourceCopy=option('--saved-copy'),budget=Math.max(120,Math.min(240,Number(option('--budget','210'))));
assert.ok(Number.isFinite(budget));
const soakSeconds=Number(option('--stability-soak','0'));
assert.ok(soakSeconds===0||soakSeconds===180,'Use --stability-soak=180');
assert.ok(!soakSeconds||budget>=210,'Soak needs at least --budget=210 for its final input checks');
const data=join(output,'private-save');mkdirSync(data);
const database=join(data,'world.sqlite');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
let sourceHash;
if(sourceCopy){
 const source=resolve(sourceCopy);assert.notEqual(source,database);
 assert.ok(!existsSync(source+'-wal')||statSync(source+'-wal').size===0,'Use a closed verified SQLite COPY, not a live database with WAL');
 sourceHash=hash(source);copyFileSync(source,database);assert.equal(hash(database),sourceHash);
}
let bridge,service,fixtureTimer;
const fixtureHistory=[];
try{
 if(packageDir){
  const {startNativeBridge}=await import(pathToFileURL(join(resolve(packageDir),'launch-native.mjs')));
  bridge=await startNativeBridge({data,legacy:join(output,'no-personal-legacy.sqlite'),backups:join(output,'private-backups')});service=bridge.service;
 }else{
  const finalWorld=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
  service=startWorldServer({database,finalWorld,collision:finalWorld.spaces.surface.collision,terrain:finalWorld.spaces.surface.terrain,port:0,beta:true});
 }
 if(!service.server.listening)await once(service.server,'listening');
 const url=`http://127.0.0.1:${service.server.address().port}`;
 const response=await fetch(url+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Stability QA',classId:'knight'})});assert.equal(response.status,201);
 const session=await response.json(),world=service.world,hero=world.state.characters[session.snapshot.character.id],geography=world.finalWorld;
 assert.ok(geography,'FinalWorld is required');
 // One initial test-character setup. No per-route health/gold/resources reset.
 hero.level=40;hero.gold=10000;world.recalculate(hero);
 if(soakSeconds)for(const itemId of ['wardens_blade','militia_plate','fallen_helm_open','wolf_gloves','grave_boots','ash_belt']){
  const item=hero.inventory.find(v=>v.id===itemId);assert.ok(item,'Missing existing beta fixture equipment '+itemId);
  const receipt=world.command(hero.id,'stability-equip-'+itemId,{type:'equip',item:{...item}});assert.ok(receipt.ok,receipt.reason);
 }
 hero.hp=hero.maxHp;hero.mp=hero.maxMp;world.checkpoint();
 const prepareFixture=createNativeStabilityFixtureRunner(world,geography,hero,{soakSeconds});
 const bootstrap=join(output,'private-bootstrap.json');
 writeFileSync(bootstrap,JSON.stringify({server_url:url,profiles:[{id:hero.id,token:session.token,name:hero.name,classId:hero.classId,level:hero.level}]}));
 let handled='';
 fixtureTimer=setInterval(()=>{
  const requestPath=join(output,'fixture-request.json');if(!existsSync(requestPath))return;
  let request;try{request=JSON.parse(readFileSync(requestPath,'utf8'));}catch{return;}
  if(request.stage===handled)return;handled=request.stage;
  try{
   const result=prepareFixture(request.stage);world.checkpoint();fixtureHistory.push(result);
   writeFileSync(join(output,'fixture-ready.json'),JSON.stringify(result));
  }catch(error){writeFileSync(join(output,'fixture-ready.json'),JSON.stringify({stage:request.stage,error:String(error.message)}));}
 },50);
 const mode=packageDir?['--packaged','--cwd',dirname(binary)]:['--project','godot-pc'];
 const userRoot=resolve(option('--qa-user-root',join(output,'isolated-user')));
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',binary,...mode,'--output',join(output,'native'),'--qa-user-root',userRoot,'--timeout',String(budget+150),'--','--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${join(output,'stability.json')}`,'--qa-scope=stage','--block=stability',`--stability-budget=${budget}`,...(soakSeconds?[`--stability-soak=${soakSeconds}`]:[]),...(packageDir?['--qa-packaged']:[]),...(options.includes('--qa-graphics=low')?['--qa-graphics=low']:[])];
 const child=spawn(process.env.PYTHON??'python',args,{stdio:'inherit',windowsHide:true});
 const [exitCode]=await once(child,'exit');
 let report;try{report=JSON.parse(readFileSync(join(output,'stability.json'),'utf8'));}catch{}
 const wrapper=JSON.parse(readFileSync(join(output,'native/result.json'),'utf8'));
 const sourceUnchanged=!sourceCopy||hash(resolve(sourceCopy))===sourceHash;
 const summary={ok:exitCode===0&&report?.ok===true&&wrapper.clean_error_log&&sourceUnchanged,nativeExitCode:exitCode,cleanErrorLog:wrapper.clean_error_log,sourceCopyUsed:Boolean(sourceCopy),sourceCopyUnchanged:sourceUnchanged,
  fixtureHistory,checks:report?.checks??{},metrics:report?.metrics??{},graphics:report?.graphics??{},health:report?.health??{},reason:report?.reason??'Client did not produce final report',budgetSeconds:budget,soakSeconds,initialTestHero:{class:'knight',level:40,gold:10000,equipment:Object.values(hero.equipment).filter(Boolean).map(i=>({id:i.id,plus:i.plus??0}))},population:world.state.monsters.length};
 writeFileSync(join(output,'stability-summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({ok:summary.ok,checks:summary.checks,metrics:summary.metrics,reason:summary.reason}));
 if(!summary.ok)process.exitCode=1;
}finally{
 clearInterval(fixtureTimer);
 if(bridge)await bridge.close();else if(service)await service.close();
}
