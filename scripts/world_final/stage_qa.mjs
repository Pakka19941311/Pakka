import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {startWorldServer} from '../../server/http-server.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
const [binary,out,...options]=process.argv.slice(2),output=resolve(out),packageArg=options.find(x=>x.startsWith('--package='));
mkdirSync(output,{recursive:true});assert.ok(!existsSync(join(output,'stage.json')),'Use fresh QA output');
const geography=new FinalWorld();let bridge;
if(packageArg){const {startNativeBridge}=await import(pathToFileURL(join(resolve(packageArg.slice(10)),'launch-native.mjs')));bridge=await startNativeBridge({data:join(output,'save'),backups:join(output,'backups')});}
const service=bridge?.service??startWorldServer({database:join(output,'world.sqlite'),finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,port:0,beta:true});
try{
 if(!service.server.listening)await once(service.server,'listening');
 const server_url=`http://127.0.0.1:${service.server.address().port}`;
 const result=await fetch(server_url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Проверка этапа',classId:'knight'})});assert.equal(result.status,201);
 const session=await result.json(),world=service.world,p=world.state.characters[session.snapshot.character.id];
 p.level=40;world.recalculate(p);p.gold=200000;p.hp=p.maxHp-150;
 p.inventory.find(i=>i.id==='potion').count=10;
 world.relocate(p,{...geography.services['npc:shop'],x:geography.services['npc:shop'].x+2});world.checkpoint();
 const bootstrap=join(output,'bootstrap.json');writeFileSync(bootstrap,JSON.stringify({server_url,profiles:[{id:p.id,token:session.token,name:p.name,classId:p.classId,level:p.level}]}));
 const mode=packageArg?['--packaged','--cwd',dirname(resolve(binary))]:['--project','godot-pc'];
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(binary),...mode,'--output',join(output,'native'),'--timeout','360','--',...options.filter(x=>x==='--headless'),'--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${join(output,'stage.json')}`,'--qa-scope=stage',...options.filter(x=>x.startsWith('--block='))];
 const process=spawn(globalThis.process.env.PYTHON??'python',args,{stdio:'inherit',windowsHide:true});const [code]=await once(process,'exit');assert.equal(code,0);
 const report=JSON.parse(readFileSync(join(output,'stage.json'),'utf8'));assert.equal(report.ok,true,JSON.stringify(report.checks));
 assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(readFileSync(join(output,'native/engine.log'),'utf8')));
 console.log(JSON.stringify({checks:report.checks,ok:true}));
}finally{if(bridge)await bridge.close();else await service.close();}
