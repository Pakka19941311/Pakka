// Focused real-game knight integration. The disposable beta world is unrelated
// to player saves; the production launcher/HTTP/SSE/equipment paths stay real.
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { restoreWorldTopology } from '../src/world/world-topology.ts';
import { isTerritorySafe } from '../src/world/territory.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [binaryArg, outputArg, ...options] = process.argv.slice(2);
assert.ok(binaryArg && outputArg, 'Usage: godot-knight-qa.mjs BINARY OUTPUT [--project=godot-pc] [--package=DIR] [--graphical] [--timeout-ms=180000]');
for (const value of options) assert.ok(value==='--graphical' || /^(--project|--package|--timeout-ms)=/.test(value), `Unknown option ${value}`);
const option = name => options.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const binary = resolve(binaryArg), output = resolve(outputArg);
const project = option('--project') ? resolve(option('--project')) : undefined;
const graphical = options.includes('--graphical');
const timeoutMs = Number(option('--timeout-ms') || 180000);
assert.ok(Number.isInteger(timeoutMs) && timeoutMs>=1000 && timeoutMs<=1800000, 'Invalid timeout');
assert.ok(existsSync(binary), 'Godot binary is missing');
if (project) assert.ok(existsSync(join(project,'project.godot')), 'Godot source project is missing');
mkdirSync(output, {recursive:true});
const privateRoot = mkdtempSync(join(tmpdir(), 'varendor-knight-qa-'));
const stage = option('--package') ? resolve(option('--package')) : join(privateRoot,'application');
const reportPath = join(output, 'knight-native.json');
const logPath = join(output, 'knight-native.log');
const summaryPath = join(output, 'knight-integration.json');
// A failed run must not accidentally reuse the previous successful report.
for (const file of [reportPath, summaryPath]) if (existsSync(file)) rmSync(file);
const source = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
const started = Date.now();
let bridge, child, timeout, forcedKill, log = '', failure, native;
let fixture;
const requests = [];
let interrupted;
let stopping = false;
const stopChild = () => {
  if (!child || child.exitCode!==null || child.signalCode!==null || stopping) return;
  stopping = true;
  child.kill();
  forcedKill = setTimeout(()=>{ if(child.exitCode===null && child.signalCode===null) child.kill('SIGKILL'); },3000);
  forcedKill.unref();
};
const interrupt = signal => { interrupted=signal; stopChild(); };
const sigint = () => interrupt('SIGINT');
const sigterm = () => interrupt('SIGTERM');
process.once('SIGINT',sigint); process.once('SIGTERM',sigterm);
try {
  if (option('--package')) assert.ok(existsSync(join(stage,'launch-native.mjs')), 'Packaged native server is missing');
  else {
    const {stageNativeServer} = await import('./package-godot-pc.mjs');
    stageNativeServer(root,stage);
  }
  const {startNativeBridge} = await import(pathToFileURL(join(stage,'launch-native.mjs')));
  bridge = await startNativeBridge({data:join(privateRoot,'save'),legacy:undefined,backups:join(privateRoot,'backups')});
  bridge.service.server.on('request',(req,res)=>{
    const path=req.url.split('?')[0];
    if(!['/api/session','/api/world','/api/health'].includes(path)) return;
    const entry={path,method:req.method,atMs:Date.now()-started};
    requests.push(entry);
    res.once('finish',()=>{entry.status=res.statusCode;entry.durationMs=Date.now()-started-entry.atMs;});
  });
  const response = await fetch(bridge.url+'/api/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Knight integration',classId:'knight'}),signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,201,'Fresh beta knight session creation failed');
  const session = await response.json();
  const world = bridge.service.world;
  const hero = world.state.characters[session.snapshot.character.id];
  assert.deepEqual(hero.equipment,{},'The fixture must begin without equipped gear');
  const expected = ['wardens_blade','militia_plate','fallen_helm','fallen_helm_open','wolf_gloves','grave_boots','ash_belt'];
  assert.ok(expected.every(id=>hero.inventory.some(item=>item.id===id)),'Fresh beta knight review kit is missing');
  const topology = restoreWorldTopology(JSON.parse(readFileSync(join(stage,'public/assets/world/world-topology.json'),'utf8')));
  const start = topology.collision.findNearestFree({x:-75,z:5},.46);
  assert.equal(isTerritorySafe(start),false,'Combat fixture must be outside the city sanctuary');
  Object.assign(hero,start,{direction:{x:0,z:0},destination:null,target:null,autoAttack:false,singleAttack:false});
  const target = world.state.monsters.find(monster=>monster.id==='wolf');
  assert.ok(target,'The existing wolf species is missing');
  const targetPoint = topology.collision.findNearestFree({x:start.x+12,z:start.z},.46);
  assert.equal(isTerritorySafe(targetPoint),false,'Target fixture must be outside the city sanctuary');
  for (const monster of world.state.monsters) {
    if (monster===target) continue;
    monster.alive=false; monster.hp=0; monster.respawnAt=world.state.time+3600000;
    monster.deathAt=world.state.time-4000; monster.corpseUntil=world.state.time-1000;
  }
  Object.assign(target,targetPoint,{home:{...targetPoint},hp:5000,alive:true,regionId:undefined,targetId:null,provokedBy:undefined});
  world.checkpoint();
  const bootstrap = JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));
  bootstrap.profiles=[{token:session.token,id:hero.id,name:hero.name,classId:hero.classId,level:hero.level}];
  writeFileSync(bridge.bootstrapPath,JSON.stringify(bootstrap,null,2)+'\n',{mode:0o600});
  fixture = {kind:'disposable beta world; actual gameplay scene',hero:{classId:hero.classId,start,equipment:hero.equipment,bagIds:hero.inventory.map(item=>item.id)},target:{id:target.id,start:targetPoint,hp:target.hp},otherMonsters:'inactive in this fixture only',weather:world.snapshot(hero.id).environment.weather,combatStats:'unchanged; only target HP is raised to observe a sustained combo',playerSavesOpened:false};
  writeFileSync(join(output,'knight-fixture.json'),JSON.stringify(fixture,null,2)+'\n');
  const args = [...(project?['--path',project]:[]),'--audio-driver','Dummy',...(graphical?[]:['--headless']),'--',`--bootstrap=${bridge.bootstrapPath}`,`--qa=${reportPath}`,'--qa-scope=knight'];
  assert.ok(!interrupted,`Interrupted by ${interrupted}`);
  writeFileSync(logPath,'');
  child=spawn(binary,args,{cwd:project||stage,stdio:['ignore','pipe','pipe'],env:{...process.env,XDG_DATA_HOME:join(privateRoot,'godot-data'),APPDATA:join(privateRoot,'appdata'),LOCALAPPDATA:join(privateRoot,'localappdata')}});
  const consume = bytes => { const chunk=bytes.toString(); log+=chunk; appendFileSync(logPath,chunk); if(/SCRIPT ERROR:/m.test(log)) stopChild(); };
  child.stdout.on('data',consume); child.stderr.on('data',consume);
  let timedOut=false;
  timeout=setTimeout(()=>{timedOut=true;stopChild();},timeoutMs);
  const result=await new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolveExit({code,signal}));});
  clearTimeout(timeout); clearTimeout(forcedKill);
  writeFileSync(logPath,log);
  assert.ok(!interrupted,`Interrupted by ${interrupted}`);
  assert.ok(!timedOut,`Native knight QA exceeded ${timeoutMs}ms`);
  if (existsSync(reportPath)) native=JSON.parse(readFileSync(reportPath,'utf8'));
  console.log('VARENDOR_KNIGHT_SUMMARY '+JSON.stringify({ok:native?.ok??false,scope:native?.scope,failed:Object.entries(native?.checks??{}).filter(([key,value])=>value===false&&key!=='native_render').map(([key])=>key),exit:result}));
  const errors=log.split('\n').filter(line=>/SCRIPT ERROR:|^ERROR:/m.test(line));
  const failedChecks=Object.entries(native?.checks??{}).filter(([key,value])=>value===false&&key!=='native_render').map(([key])=>key);
  const diagnosis=errors.join('\n')||(native?'Native checks failed: '+failedChecks.join(', '):log.split('\n').filter(line=>!line.startsWith('VARENDOR_NATIVE_QA ')).join('\n').slice(-4000));
  assert.equal(result.code,0,diagnosis);
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(native,'Native knight QA report is missing');
  assert.equal(native.scope,'knight-integration','Wrong native regression scope');
  assert.equal(native.ok,true,'Native knight integration checks failed');
  assert.equal(native.checks.connected,true,'Native client must connect to the real adapter');
  if(graphical) assert.equal(native.checks.native_render,true,'Requested graphical run used headless rendering');
} catch(error) {
  failure=error;
  console.error('VARENDOR_KNIGHT_FAILURE '+(error instanceof Error?error.message:String(error)));
} finally {
  clearTimeout(timeout); clearTimeout(forcedKill);
  if(child && child.exitCode===null && child.signalCode===null) {
    stopChild();
    await new Promise(resolveExit=>child.once('close',resolveExit));
  }
  writeFileSync(logPath,log);
  if(bridge) {
    try { await bridge.close(); } catch(error) { failure??=error; }
  }
  process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
  const captures = readdirSync(output,{recursive:true}).filter(file=>file.startsWith('knight-') && /\.(png|jpg|jpeg|mp4)$/i.test(file)).map(file=>relative(output,join(output,file)).split('\\').join('/'));
  const summary={ok:!failure,source,platform:process.platform,node:process.version,native:native??null,scope:'knight-integration',mode:project?'source Godot gameplay project':'exported native client',graphicalRequested:graphical,softwareRenderer:/llvmpipe|softpipe|SwiftShader/i.test(log),windowsGraphics:graphical&&process.platform==='win32'&&native?.checks?.native_render===true,durationMs:Date.now()-started,captures,fixture,requests,notes:['Actual gameplay scene and native launcher adapter with a disposable beta save.','This check covers knight model, equipment, movement and authored animation binding only.','Headless runs do not verify pixels or graphics performance.'],...(failure?{error:failure instanceof Error?failure.message:String(failure)}:{})};
  writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');
  rmSync(privateRoot,{recursive:true,force:true});
  console.log('VARENDOR_KNIGHT_REPORT '+summaryPath);
}
if(failure) process.exitCode=1;
