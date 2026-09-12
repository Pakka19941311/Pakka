// Isolated native UI/HTTP transaction fixture. This is not an end-to-end field hunt or packaged-build acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startWorldServer} from '../server/http-server.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {PROGRESSION_QUESTS} from '../src/data/progression-quests-v3.ts';
import {initializeProgressionQuests,recordProgressionQuestEvent} from '../src/core/progression-quests-v3.ts';
const [binary,out,...options]=process.argv.slice(2);assert.ok(binary&&out,'Usage: node scripts/progression-quest-qa.mjs GODOT OUTPUT [--headless]');
const output=resolve(out),report=join(output,'progression.json');mkdirSync(output,{recursive:true});assert.ok(!existsSync(report),'Use a fresh QA output');
const geography=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const service=startWorldServer({database:join(output,'world.sqlite'),finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,port:0,beta:true,xpRate:9});let timer;
try{
 if(!service.server.listening)await once(service.server,'listening');const server_url=`http://127.0.0.1:${service.server.address().port}`;
 const response=await fetch(server_url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Поздние поручения',classId:'knight'})});assert.equal(response.status,201);
 const session=await response.json(),world=service.world,id=session.snapshot.character.id;world.state.monsters=[];
 const moveTo=(p,npc)=>world.relocate(p,{...geography.services[npc],x:geography.services[npc].x+2});
 const hero=world.state.characters[id];Object.assign(hero,{level:10,xp:0,gold:1000,inventory:[],equipment:{}});world.recalculate(hero);hero.hp=hero.maxHp;moveTo(hero,'npc:elder');world.checkpoint();
 let handled='';timer=setInterval(()=>{
  const file=join(output,'fixture-request.json');if(!existsSync(file))return;const request=JSON.parse(readFileSync(file,'utf8'));if(handled===request.stage)return;handled=request.stage;
  const p=world.state.characters[id];
  if(['late-ready-110','late-ready-125'].includes(request.stage)){
   const questId=request.stage.endsWith('110')?'QUEST-110':'QUEST-125';
   for(const marker of PROGRESSION_QUESTS.find(q=>q.id===questId).markers)Object.assign(p,recordProgressionQuestEvent(p,{kind:'marker',...world.progressionWorld.bindings.markers[marker.id]},world.progressionWorld.bindings));
   if(questId==='QUEST-125')p.inventory=Array.from({length:42},()=>world.item('potion'));
  }else if(request.stage==='late-level-25'){p.level=25;p.xp=0;world.recalculate(p);}
  else if(request.stage==='late-free-cell'){p.inventory.pop();}
  else if(request.stage==='late-legacy-books'){
   Object.assign(p,{level:60,xp:0,inventory:[],bookQuests:{book_knight_50:'ready',book_knight_60:'ready'}});delete p.progressionQuests;
   Object.assign(p,initializeProgressionQuests(p));world.recalculate(p);p.hp=p.maxHp;moveTo(p,'npc:books');
  }else throw Error('unknown-late-fixture:'+request.stage);
  world.checkpoint();writeFileSync(join(output,'fixture-ready.json'),JSON.stringify({stage:request.stage,generation:p.generation}));
 },100);
 const bootstrap=join(output,'bootstrap.json');writeFileSync(bootstrap,JSON.stringify({server_url,profiles:[{id,token:session.token,name:hero.name,classId:hero.classId,level:hero.level}]}));
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(binary),'--project','godot-pc','--output',join(output,'native'),'--timeout','180','--',...options.filter(a=>a==='--headless'),'--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${report}`,'--qa-scope=progression'];
 const child=spawn(process.env.PYTHON??'python',args,{stdio:'inherit',windowsHide:true});const [code]=await once(child,'exit');assert.equal(code,0);
 const result=JSON.parse(readFileSync(report,'utf8'));assert.equal(result.ok,true,JSON.stringify(result.checks));console.log(JSON.stringify(result));
}finally{clearInterval(timer);await service.close();}
