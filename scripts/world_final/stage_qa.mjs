import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {startWorldServer} from '../../server/http-server.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
const [binary,out,...options]=process.argv.slice(2),output=resolve(out),packageArg=options.find(x=>x.startsWith('--package='));
const castlePreview=options.includes('--castle-preview'),castle=options.includes('--castle')||castlePreview,reportName=castle?'castle.json':'stage.json';
mkdirSync(output,{recursive:true});assert.ok(!existsSync(join(output,reportName)),'Use fresh QA output');
const geography=new FinalWorld();let bridge,fixtureTimer;
if(packageArg){const {startNativeBridge}=await import(pathToFileURL(join(resolve(packageArg.slice(10)),'launch-native.mjs')));bridge=await startNativeBridge({data:join(output,'save'),backups:join(output,'backups')});}
const service=bridge?.service??startWorldServer({database:join(output,'world.sqlite'),finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,port:0,beta:true});
try{
 if(!service.server.listening)await once(service.server,'listening');
 const server_url=`http://127.0.0.1:${service.server.address().port}`;
 const result=await fetch(server_url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Проверка этапа',classId:'knight'})});assert.equal(result.status,201);
 const session=await result.json(),world=service.world,p=world.state.characters[session.snapshot.character.id];
 p.level=40;world.recalculate(p);p.gold=200000;p.hp=p.maxHp-150;
 p.inventory.find(i=>i.id==='potion').count=10;
 if(castlePreview){for(const [slot,id] of Object.entries({weapon:'wardens_blade',chest:'militia_plate',head:'fallen_helm',gloves:'wolf_gloves',boots:'grave_boots',belt:'ash_belt'}))p.equipment[slot]=world.item(id);world.recalculate(p);p.hp=p.maxHp;}
 world.relocate(p,{...geography.services['npc:shop'],x:geography.services['npc:shop'].x+2});world.checkpoint();
 let handled='';
 fixtureTimer=setInterval(()=>{
  const file=join(output,'fixture-request.json');if(!existsSync(file))return;
  const request=JSON.parse(readFileSync(file,'utf8'));if(request.stage===handled)return;handled=request.stage;
  const hero=world.state.characters[p.id],boss=world.state.monsters.find(m=>m.id==='cave_boss');
  if(castle&&request.stage.startsWith('castle-')){
   const positions={entry:[-100,-238],market:[-118,-205],training:[-52,-149],well:[-116,-161],supply:[-68,-192],return:[-100,-190],overview:[-100,-150],interior:[0,-4],tavern:[-137,-199],citadel:[-100,-147],fair:[-113,-204],alehouse:[-74,-194]};
   const key=request.stage.slice(7),point=positions[key];assert.ok(point,'unknown courtyard QA point');
   world.relocate(hero,{x:point[0],z:point[1],spaceId:key==='interior'?'great_cave':'surface'});
  }
  else if(request.stage==='cave-entrance'){world.relocate(hero,{x:245,z:278,spaceId:'surface'});hero.hp=hero.maxHp;}
  else if(request.stage==='cave-finish'){
   // Keep the native regression short after observing real damage/animation.
   // The production definition remains 14400 HP; loot/respawn use normal death.
   if(!boss?.alive||boss.hp>=14400)throw Error('native boss has not taken a real hit');
   boss.hp=Math.min(boss.hp,120);hero.hp=hero.maxHp;
  }else throw Error('unknown-stage-fixture:'+request.stage);
  world.checkpoint();writeFileSync(join(output,'fixture-ready.json'),JSON.stringify({stage:request.stage,generation:hero.generation}));
 },100);
 const bootstrap=join(output,'bootstrap.json');writeFileSync(bootstrap,JSON.stringify({server_url,profiles:[{id:p.id,token:session.token,name:p.name,classId:p.classId,level:p.level}]}));
 const mode=packageArg?['--packaged','--cwd',dirname(resolve(binary))]:['--project','godot-pc'];
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(binary),...mode,'--output',join(output,'native'),'--timeout','360','--',...options.filter(x=>x==='--headless'),'--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${join(output,reportName)}`,`--qa-scope=${castlePreview?'castle-preview':castle?'castle':'stage'}`,...options.filter(x=>x.startsWith('--block='))];
 const process=spawn(globalThis.process.env.PYTHON??'python',args,{stdio:'inherit',windowsHide:true});const [code]=await once(process,'exit');assert.equal(code,0);
 const report=JSON.parse(readFileSync(join(output,reportName),'utf8'));assert.equal(report.ok,true,JSON.stringify(report.checks));
 assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(readFileSync(join(output,'native/engine.log'),'utf8')));
 console.log(JSON.stringify({checks:report.checks,ok:true}));
}finally{clearInterval(fixtureTimer);if(bridge)await bridge.close();else await service.close();}
