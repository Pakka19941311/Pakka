// Real native gameplay + production HTTP/SSE adapter, isolated from player saves.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,existsSync,readFileSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {stageNativeServer} from './package-godot-pc.mjs';
import {SERVICES} from '../src/world/territory.ts';
const [binaryArg,outputArg,...args]=process.argv.slice(2);
assert.ok(binaryArg&&outputArg,'Usage: godot-content-qa.mjs BINARY OUTPUT [--project=DIR] [--package=DIR] [--graphical]');
const option=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const root=process.cwd(),binary=resolve(binaryArg),output=resolve(outputArg),project=option('--project'),graphical=args.includes('--graphical');
mkdirSync(output,{recursive:true});const temporary=mkdtempSync(join(output,'.content-qa-'));
const stage=option('--package')?resolve(option('--package')):join(temporary,'application');
const report=join(output,'content-native.json'),phase=join(output,'phase.json'),logPath=join(output,'content-native.log');
for(const path of [report,phase])if(existsSync(path))rmSync(path);
let bridge,child,timer,watcher,log='',failure;const events=[];let native;
try{
 if(!option('--package'))stageNativeServer(root,stage);
 const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
 bridge=await startNativeBridge({data:join(temporary,'save'),backups:join(temporary,'backups')});
 const response=await fetch(bridge.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Books QA',classId:'knight'})});assert.equal(response.status,201);
 const session=await response.json(),world=bridge.service.world,hero=world.state.characters[session.snapshot.character.id];
 const shop=SERVICES['npc:asterhold:shop'];Object.assign(hero,{x:shop.x,z:shop.z+2,level:60,gold:250000});world.recalculate(hero);hero.hp=hero.maxHp;hero.mp=hero.maxMp;
 const target=world.state.monsters.find(m=>m.id==='wolf');assert.ok(target);world.state.monsters=[target];
 Object.assign(target,{x:-72.9,z:5,home:{x:-72.9,z:5},hp:100000,regionId:undefined,attackReadyAt:world.state.time+600000});
 world.addItem(hero,'book_knight_50');world.addItem(hero,'book_knight_60');if(!hero.inventory.some(i=>i.id==='haste'))world.addItem(hero,'haste');world.checkpoint();
 const bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));bootstrap.profiles=[{token:session.token,id:hero.id,name:hero.name,classId:hero.classId,level:hero.level}];writeFileSync(bridge.bootstrapPath,JSON.stringify(bootstrap));
 writeFileSync(join(output,'content-fixture.json'),JSON.stringify({kind:'disposable save; real production adapter',hero:'Knight level 60, 250000 silver at Edric; quest books supplied only to fixture',target:'existing wolf, HP 100000 to observe sustained attacks; no incoming attacks',playerSavesOpened:false},null,2));
 let moved=false;
 watcher=setInterval(()=>{
  if(!moved&&existsSync(phase)&&JSON.parse(readFileSync(phase,'utf8')).stage==='combat'){
   moved=true;Object.assign(hero,{x:-75,z:5,direction:{x:0,z:0},destination:null,target:null,autoAttack:false,generation:hero.generation+1});world.motors.delete(hero.id);world.checkpoint();
  }
 },50);
 const env={...process.env,APPDATA:join(temporary,'appdata'),LOCALAPPDATA:join(temporary,'localappdata'),XDG_DATA_HOME:join(temporary,'godot-data')};
 for(const p of [env.APPDATA,env.LOCALAPPDATA,env.XDG_DATA_HOME])mkdirSync(p,{recursive:true});
 writeFileSync(logPath,'');
 child=spawn(binary,[...(project?['--path',resolve(project)]:[]),'--verbose','--audio-driver','Dummy',...(graphical?['--windowed','--resolution','1600x900']:['--headless']),'--',`--bootstrap=${bridge.bootstrapPath}`,`--qa=${report}`,'--qa-scope=content'],{cwd:project?resolve(project):stage,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const consume=b=>{const text=b.toString();log+=text;appendFileSync(logPath,text);if(text.includes('SCRIPT ERROR:'))child.kill();};child.stdout.on('data',consume);child.stderr.on('data',consume);
 timer=setTimeout(()=>child.kill(),180000);
 const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});assert.equal(code,0,log.slice(-4000));
 assert.ok(existsSync(report),'Native report missing');native=JSON.parse(readFileSync(report,'utf8'));
 assert.equal(native.ok,true,JSON.stringify(native.checks));
 const errors=log.split('\n').filter(line=>/SCRIPT ERROR:|^ERROR:/.test(line)&&!(project&&process.platform==='win32'&&line.trim()==='ERROR: Failed to read the root certificate store.'));
 assert.deepEqual(errors,[]);if(graphical)assert.equal(native.checks.native_render,true);
 const hits=world.events.filter(e=>e.kind==='hit'&&e.actor===hero.id&&e.target===target.uid);assert.ok(hits.length>=3,'Autoattack must continue from one intent');
 events.push(...world.events.filter(e=>e.actor===hero.id));
}catch(error){failure=error;console.error(error.stack??error);}
finally{
 clearInterval(watcher);clearTimeout(timer);if(child&&child.exitCode===null){child.kill();await new Promise(done=>child.once('close',done));}if(bridge)await bridge.close();
 writeFileSync(join(output,'content-integration.json'),JSON.stringify({ok:!failure,graphical,platform:process.platform,native,events,localSandboxCertificateWarning:log.includes('Failed to read the root certificate store.'),...(failure?{error:String(failure)}:{})},null,2));
 // Verified dedicated child of the caller's QA output, never a user save path.
 assert.ok(resolve(temporary).startsWith(output+sep)&&temporary.includes('.content-qa-'));
 try{rmSync(temporary,{recursive:true,force:true});}catch(error){writeFileSync(join(output,'cleanup-note.json'),JSON.stringify({temporary,cleanupError:error.code,notForPublication:true}));}
}
if(failure)process.exitCode=1;
