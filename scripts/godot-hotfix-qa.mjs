// Seven owner-reported regressions, actual client and isolated production server.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {stageNativeServer} from './package-godot-pc.mjs';
import {SERVICES} from '../src/world/territory.ts';
const [binaryArg,outputArg,...args]=process.argv.slice(2),option=n=>args.find(a=>a.startsWith(n+'='))?.slice(n.length+1);
assert.ok(binaryArg&&outputArg);
const output=resolve(outputArg),project=option('--project'),graphical=args.includes('--graphical');mkdirSync(output,{recursive:true});
const temporary=mkdtempSync(join(output,'.hotfix-save-')),stage=option('--package')?resolve(option('--package')):join(temporary,'application');
if(!option('--package'))stageNativeServer(process.cwd(),stage);
const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
const bridge=await startNativeBridge({data:join(temporary,'save'),backups:join(temporary,'backups')});
const session=await (await fetch(bridge.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Hotfix QA',classId:'knight'})})).json();
const world=bridge.service.world,id=session.snapshot.character.id,p=world.state.characters[id];let serial=0;
const item=(id,count=1)=>({uid:`hotfix-item-${++serial}`,id,plus:0,count});
Object.assign(p,{x:SERVICES['npc:storage'].x,z:SERVICES['npc:storage'].z+1.5,level:60,gold:250000});
p.equipment.weapon=item('wardens_blade');p.equipment.chest=item('militia_plate');p.inventory=[item('potion',20),item('ether',20),item('haste',5)];p.storage=[item('potion',30),item('ether',9)];
for(const level of [10,20,30,40,50,60])p.inventory.push(item(`book_knight_${level}`));world.recalculate(p);p.hp=p.maxHp;p.mp=p.maxMp;
if(args.includes('--sliding')){Object.assign(p,{x:SERVICES['npc:teleport'].x,z:SERVICES['npc:teleport'].z,level:10,xp:16000});world.recalculate(p);p.hp=p.maxHp;p.mp=p.maxMp;}
const bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));bootstrap.profiles=[{token:session.token,id,name:p.name,classId:p.classId,level:p.level}];writeFileSync(bridge.bootstrapPath,JSON.stringify(bootstrap));
const phasePath=join(output,'hotfix-phase.json');let phase='';const ticks=[];let previous=performance.now();
const watcher=setInterval(()=>{const now=performance.now();ticks.push(now-previous);previous=now;
 if(!existsSync(phasePath))return;const next=JSON.parse(readFileSync(phasePath,'utf8')).phase;if(next===phase)return;phase=next;const hero=world.state.characters[id];
 if(phase==='walk'){Object.assign(hero,{x:args.includes('--sliding')?-75:-110,z:args.includes('--sliding')?-83:-105,generation:hero.generation+1,direction:{x:0,z:0},target:null,autoAttack:false});world.motors.delete(id);world.checkpoint();}
 if(phase==='combat'){Object.assign(hero,{x:-75,z:5,generation:hero.generation+1,direction:{x:0,z:0},target:null,autoAttack:false});world.motors.delete(id);const target=world.state.monsters.find(m=>m.id==='wolf');Object.assign(target,{x:-72.9,z:5,home:{x:-72.9,z:5},hp:100000,attackReadyAt:world.state.time+600000});world.checkpoint();}
},20);
const env={...process.env,APPDATA:join(temporary,'appdata'),LOCALAPPDATA:join(temporary,'localappdata'),XDG_DATA_HOME:join(temporary,'godot-data')};for(const key of ['APPDATA','LOCALAPPDATA','XDG_DATA_HOME'])mkdirSync(env[key],{recursive:true});
let log='',native,error;const child=spawn(resolve(binaryArg),[...(project?['--path',resolve(project)]:[]),'--audio-driver','Dummy',...(graphical?['--windowed','--resolution','1600x900']:['--headless']),'--',`--bootstrap=${bridge.bootstrapPath}`,`--qa=${join(output,'hotfix-native.json')}`,(args.includes('--sliding')?'--qa-scope=sliding':'--qa-scope=hotfix'),...(args.includes('--sliding-4k')?['--sliding-4k']:[]),...(args.includes('--diagnose')?['--hotfix-diagnose']:[]),...(args.includes('--slow')?['--hotfix-slow']:[])],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const consume=b=>{log+=b.toString();writeFileSync(join(output,'hotfix-native.log'),log);if(b.toString().includes('SCRIPT ERROR:'))child.kill();};child.stdout.on('data',consume);child.stderr.on('data',consume);
const timeout=setTimeout(()=>child.kill(),300000);
try{const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done)});if(existsSync(join(output,'hotfix-native.json')))native=JSON.parse(readFileSync(join(output,'hotfix-native.json'),'utf8'));assert.equal(code,0,log.slice(-4500));const errors=log.split(String.fromCharCode(10)).filter(line=>/SCRIPT ERROR:|^ERROR:/.test(line)&&!(project&&process.platform==='win32'&&line.trim()==='ERROR: Failed to read the root certificate store.'));assert.deepEqual(errors,[]);assert.equal(/VARENDOR_QA_NOTICE.*(Соединение потеряно|Нет соединения)/.test(log),false,'Unexpected local transport reconnect');assert.equal(native?.ok,true,JSON.stringify(native?.checks));if(graphical)assert.equal(native.checks.native_render,true);}catch(e){error=String(e);console.error(error);}finally{clearTimeout(timeout);clearInterval(watcher);await bridge.close();ticks.sort((a,b)=>a-b);writeFileSync(join(output,'hotfix-integration.json'),JSON.stringify({ok:!error,source:process.env.GITHUB_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,graphical,native,error,serverTimerGapMs:{p95:ticks[Math.floor(ticks.length*.95)],p99:ticks[Math.floor(ticks.length*.99)],max:ticks.at(-1)},playerSavesOpened:false},null,2));}
if(error)process.exitCode=1;
