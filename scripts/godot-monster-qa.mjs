import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const [binaryArg,outputArg,...args]=process.argv.slice(2);assert.ok(binaryArg&&outputArg);
const binary=resolve(binaryArg),output=resolve(outputArg),project=args.find(v=>v.startsWith('--project='))?.slice(10),graphical=args.includes('--graphical');mkdirSync(output,{recursive:true});
const env={...process.env,APPDATA:join(output,'.appdata'),LOCALAPPDATA:join(output,'.localappdata'),XDG_DATA_HOME:join(output,'.godot-data')};for(const p of [env.APPDATA,env.LOCALAPPDATA,env.XDG_DATA_HOME])mkdirSync(p,{recursive:true});
let log='';const child=spawn(binary,[...(project?['--path',resolve(project)]:[]),'--verbose','--audio-driver','Dummy',...(graphical?['--windowed','--resolution','1280x900']:['--headless']),'--','--qa-scope=monsters',`--monster-output=${output}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>{log+=b.toString()});child.stderr.on('data',b=>{log+=b.toString()});const timer=setTimeout(()=>child.kill(),300000);
let error,native;try{const code=await new Promise((done,reject)=>{child.on('close',done);child.on('error',reject)});assert.equal(code,0,log.slice(-6000));native=JSON.parse(readFileSync(join(output,'monster-models.json'),'utf8'));assert.equal(native.ok,true,JSON.stringify(native));assert.equal(Object.keys(native.models).length,10);if(graphical)assert.equal(native.native_render,true);const failures=log.split('\n').filter(line=>/SCRIPT ERROR:|^ERROR:/.test(line)&&!(project&&process.platform==='win32'&&line.trim()==='ERROR: Failed to read the root certificate store.'));assert.deepEqual(failures,[]);}catch(e){error=String(e);console.error(e);}finally{clearTimeout(timer);writeFileSync(join(output,'monster-native.log'),log);writeFileSync(join(output,'monster-integration.json'),JSON.stringify({ok:!error,source:process.env.GITHUB_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,graphical,native,error},null,2));}
if(error)process.exitCode=1;
