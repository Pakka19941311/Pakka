import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startWorldServer} from '../../server/http-server.mjs';
import {WorldStore} from '../../server/world-store.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
import {CLASSES} from '../../src/data/game-data.ts';
import {pathToFileURL} from 'node:url';
const [binary,outputArg,...options]=process.argv.slice(2),output=resolve(outputArg);
assert.ok(binary&&outputArg,'gameplay_qa.mjs GODOT OUTPUT [--headless]');
mkdirSync(output,{recursive:true});
assert.ok(!existsSync(join(output,'world.sqlite')),'Use a fresh isolated QA directory');
const packageOption=options.find(x=>x.startsWith('--package='));
const finalWorld=new FinalWorld();
let bridge;
if(packageOption){
 const {startNativeBridge}=await import(pathToFileURL(join(resolve(packageOption.slice(10)),'launch-native.mjs')));
 bridge=await startNativeBridge({data:join(output,'save'),backups:join(output,'backups')});
}
const service=bridge?.service??startWorldServer({database:join(output,'world.sqlite'),finalWorld,collision:finalWorld.spaces.surface.collision,terrain:finalWorld.spaces.surface.terrain,port:0,beta:true});
let poll,child;
try{
 if(!service.server.listening)await once(service.server,'listening');
 const url=`http://127.0.0.1:${service.server.address().port}`;
 const response=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Проверка нового мира',classId:'knight'})});
 assert.equal(response.status,201);
 const session=await response.json(),world=service.world,p=world.state.characters[session.snapshot.character.id];
 p.level=40;world.recalculate(p);p.hp=p.maxHp;
 for(const itemId of [CLASSES.knight.weapon,CLASSES.knight.armor]){
  const item=p.inventory.find(i=>i.id===itemId);
  assert.equal(world.command(p.id,'fixture-equip-'+itemId,{type:'equip',item}).ok,true);
 }
 const bootstrap=join(output,'bootstrap.json');
 writeFileSync(bootstrap,JSON.stringify({server_url:url,profiles:[{id:p.id,token:session.token,name:p.name,classId:p.classId,level:p.level}]}));
 let stage='',beforeCombatInventory=new Map(),soldCheck;
 const move=point=>{world.relocate(p,point);p.hp=p.maxHp;world.checkpoint();};
 poll=setInterval(()=>{
  const file=join(output,'fixture-request.json');if(!existsSync(file))return;
  let req;try{req=JSON.parse(readFileSync(file,'utf8'));}catch{return;}
  if(req.stage===stage)return;stage=req.stage;
  const result={stage};
  if(stage==='combat'){
   beforeCombatInventory=new Map(p.inventory.map(i=>[i.uid,i.count]));
   const m=world.state.monsters.find(m=>m.id==='exile'&&m.spaceId==='surface');
   const point=finalWorld.space(m).collision.findNearestFree({x:m.x+3,z:m.z},.46);
   move({...point,spaceId:'surface'});Object.assign(result,{target:m.uid,kills:p.kills});
  }else if(stage==='forest'){
   const route=JSON.parse(readFileSync('scripts/world_final/forest-route.json','utf8'));
   move({...route.start,spaceId:'surface'});Object.assign(result,route);
  }else if(stage==='merchant'){
   const npc=world.finalWorld.services['npc:shop'];
   move({x:npc.x+2,z:npc.z,spaceId:'surface'});
   const item=p.inventory.find(i=>i.count>(beforeCombatInventory.get(i.uid)??0)&&!i.id.startsWith('book_'));
   assert.ok(item,'Combat must provide actual sellable loot');
   soldCheck={uid:item.uid,gold:p.gold};Object.assign(result,{item,merchant:'npc:shop'});
  }else if(stage==='verify-sale'){
   world.checkpoint();
   assert.ok(soldCheck&&!p.inventory.some(i=>i.uid===soldCheck.uid)&&p.gold>soldCheck.gold,'Sale must remove loot and grant gold');
   const persisted=new WorldStore(bridge?.database??join(output,'world.sqlite'));
   try{const hero=persisted.load().characters[p.id];assert.equal(hero.gold,p.gold);assert.ok(!hero.inventory.some(i=>i.uid===soldCheck.uid));}finally{persisted.close();}
   Object.assign(result,{soldUid:soldCheck.uid,gold:p.gold});
  }else if(stage.startsWith('portal-')){
   const d=finalWorld.spaces[stage.slice(7)].definition;
   move({x:d.surface_portal[0],z:-d.surface_portal[2],spaceId:'surface'});
  }else throw Error('Unknown QA stage');
  result.generation=p.generation;writeFileSync(join(output,'fixture-ready.json'),JSON.stringify(result));
 },75);
 const python=process.env.PYTHON??(process.platform==='win32'?'python':'python3');
 const launchMode=packageOption?['--packaged','--cwd',dirname(resolve(binary))]:['--project','godot-pc'];
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(binary),...launchMode,'--output',join(output,'native'),'--timeout','360','--',...options.filter(x=>!x.startsWith('--package=')),'--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${join(output,'gameplay.json')}`,'--qa-scope=final'];
 child=spawn(python,args,{stdio:'inherit',windowsHide:true});
 const [code]=await once(child,'exit');assert.equal(code,0,'Checked native launch failed');
 const log=readFileSync(join(output,'native/engine.log'),'utf8');
 assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(log),'Native script error');
 const report=JSON.parse(readFileSync(join(output,'gameplay.json'),'utf8'));
 assert.equal(report.ok,true,JSON.stringify(report.checks));
 assert.equal(world.state.monsters.filter(m=>!m.temporaryOwner).length,1000);
 console.log('Authoritative final-world native checks passed.');
}finally{clearInterval(poll);if(bridge)await bridge.close();else await service.close();}
