import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {startWorldServer} from '../../server/http-server.mjs';
import {FinalWorld} from '../../src/world/final-world.ts';
import {RING_RECIPES} from '../../src/data/accessories-v3.ts';
import {ITEMS} from '../../src/data/game-data.ts';
import {LATE_HEALING_POTIONS} from '../../src/data/healing-potions-v3.ts';
import {recordStarterQuestEvent} from '../../src/core/starter-quests-v3.ts';
import {STARTER_ITEMS} from '../../src/data/starter-progression-v3.ts';
import {p2Encounter} from '../../src/data/p2-encounters.ts';
import {prepareNativePursuitFixture} from '../world_expansion_v3/p2-native-pursuit-fixture.mjs';
import {prepareNativeNatureFixture} from '../world_expansion_v3/p2-native-nature-fixture.mjs';
import {prepareNativeLineFixture} from '../world_expansion_v3/p2-native-line-fixture.mjs';
const [binary,out,...options]=process.argv.slice(2),output=resolve(out),packageArg=options.find(x=>x.startsWith('--package=')),qaUserRootArg=options.find(x=>x.startsWith('--qa-user-root='));
const castlePreview=options.includes('--castle-preview'),castle=options.includes('--castle')||castlePreview,reportName=castle?'castle.json':'stage.json';
mkdirSync(output,{recursive:true});assert.ok(!existsSync(join(output,reportName)),'Use fresh QA output');
const geography=new FinalWorld(undefined,true,options.includes('--starter-v3')?{populationMode:'starter-v3'}:{});let bridge,fixtureTimer;
if(packageArg){const {startNativeBridge}=await import(pathToFileURL(join(resolve(packageArg.slice(10)),'launch-native.mjs')));bridge=await startNativeBridge({data:join(output,'save'),backups:join(output,'backups')});}
const service=bridge?.service??startWorldServer({database:join(output,'world.sqlite'),finalWorld:geography,collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,port:0,beta:true});
try{
 if(!service.server.listening)await once(service.server,'listening');
 const server_url=`http://127.0.0.1:${service.server.address().port}`;
 const result=await fetch(server_url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Проверка этапа',classId:options.includes('--block=p2-line')?'ranger':'knight'})});assert.equal(result.status,201);
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
  let extra={};
  if(castle&&request.stage.startsWith('castle-')){
   const positions={entry:[-100,-238],market:[-118,-205],training:[-52,-149],well:[-116,-161],supply:[-68,-192],return:[-100,-190],overview:[-100,-150],interior:[0,-4],tavern:[-137,-199],citadel:[-100,-147],fair:[-113,-204],alehouse:[-74,-194]};
   const key=request.stage.slice(7),point=positions[key];assert.ok(point,'unknown courtyard QA point');
   world.relocate(hero,{x:point[0],z:point[1],spaceId:key==='interior'?'great_cave':'surface'});
  }
  else if(request.stage.startsWith('late-healing|')){
   const itemId=request.stage.split('|')[1],definition=LATE_HEALING_POTIONS[itemId];assert.ok(definition);
   hero.level=definition.requiredLevel;world.recalculate(hero);hero.hp=hero.maxHp-definition.heal-5;hero.gold=200000;
   hero.inventory=hero.inventory.filter(i=>!Object.hasOwn(LATE_HEALING_POTIONS,i.id));
   world.relocate(hero,{...geography.services['npc:shop'],x:geography.services['npc:shop'].x+2});
  }
  else if(request.stage.startsWith('trade-')){
   const id={'trade-smith':'npc:smith','trade-elza':'npc:shop','trade-alchemist':'npc:alchemist'}[request.stage];assert.ok(id,'unknown trade QA point');
   world.relocate(hero,{...geography.services[id],x:geography.services[id].x+2});
  }
  else if(request.stage==='p2-npc'){
   assert.equal(geography.populationMode,'starter-v3');
   world.relocate(hero,{x:-90,z:-203,spaceId:'surface'});
  }
  else if(request.stage.startsWith('p2-npc-view|')){
   const [,x,z]=request.stage.split('|'),point={x:Number(x),z:Number(z),spaceId:'surface'};
   assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z)&&!geography.spaces.surface.collision.isBlocked(point,.46));
   // Observer placement only: ambient NPCs keep their actual unmodified routes.
   world.relocate(hero,point);
  }
  else if(request.stage==='p2-city'||request.stage==='p2-cloak'){
   if(request.stage==='p2-cloak'){
    hero.level=60;
    for(const id of ['cloak_defense','cloak_captain','cloak_sky'])hero.inventory.push(world.item(id));
   }
   for(const id of ['starter_weapon_knight','starter_chest_knight','starter_head','starter_gloves','starter_boots','starter_belt'])hero.equipment[STARTER_ITEMS[id].slot]=world.item(id);
   world.recalculate(hero);hero.hp=hero.maxHp;
   assert.equal(geography.populationMode,'starter-v3');world.relocate(hero,{x:-90,z:-203,spaceId:'surface'});
  }
  else if(request.stage.startsWith('p2-nature-')) extra=prepareNativeNatureFixture(world,geography,hero,request.stage);
  else if(request.stage.startsWith('p2-line-')) extra=prepareNativeLineFixture(world,geography,hero,request.stage);
  else if(request.stage.startsWith('p2-pursuit-MOB-')){
   extra=prepareNativePursuitFixture(world,geography,hero,request.stage.slice('p2-pursuit-'.length));
  }
  else if(request.stage.startsWith('p2-combat-MOB-')){
   assert.equal(geography.populationMode,'starter-v3');
   const mobId=request.stage.slice('p2-combat-'.length),wolves=world.state.monsters.filter(m=>m.alive&&m.canonicalMobId==='MOB-02');
   const candidates=world.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId).sort((a,b)=>a.level-b.level||a.uid.localeCompare(b.uid));
   let target,standing;
   for(const m of candidates){
    for(let i=0;i<32;i++){
     const point={x:m.x+Math.cos(i*Math.PI/16)*3,z:m.z+Math.sin(i*Math.PI/16)*3,spaceId:'surface'};
     if(geography.safe(point)||geography.spaces.surface.collision.isBlocked(point,.46)||!world.lineOfSight(point,m))continue;
     if(mobId!=='MOB-02'&&wolves.some(w=>Math.hypot(point.x-w.x,point.z-w.z)<9))continue;
     target=m;standing=point;break;
    }if(target)break;
   }
   assert.ok(target,'No native combat standing point');
   Object.assign(hero,{level:target.level,xp:0,inventory:[],lootBuffer:[],buffs:{},equipment:Object.fromEntries(
    ['starter_weapon_'+hero.classId,'starter_chest_'+hero.classId,'starter_head','starter_gloves','starter_boots','starter_belt']
     .map(id=>[STARTER_ITEMS[id].slot,world.item(id)]))});
   world.recalculate(hero);hero.hp=hero.maxHp;hero.mp=hero.maxMp;
   world.relocate(hero,{...standing});
   extra={target:target.uid,mobId,level:target.level,maxHp:p2Encounter(target).hp,kills:hero.kills,gold:hero.gold,
    population:world.state.monsters.length,monsterHpBefore:target.hp};
  }
  else if(request.stage==='starter-v3'){
   Object.assign(hero,{level:1,xp:0,gold:1000,inventory:[],equipment:{},starterProgress:{version:1,quests:{}}});world.recalculate(hero);hero.hp=hero.maxHp;
   world.relocate(hero,{...geography.services['npc:elder'],x:geography.services['npc:elder'].x+2});
  }
  else if(request.stage==='starter-ready-101'){
   // UI transaction fixture only; field/route evidence is tested separately using live movement.
   for(let i=0;i<5;i++)Object.assign(hero,recordStarterQuestEvent(hero,{kind:'kill',speciesId:'spider',entityUid:'qa-slime-'+i,generation:1,locationId:'L02'}));
   Object.assign(hero,recordStarterQuestEvent(hero,{kind:'inspect',checkpointId:'starter:greenfall-outskirts',locationId:'L02'}));
  }
  else if(request.stage==='starter-level-seven'){hero.level=7;hero.xp=0;world.recalculate(hero);}
  else if(request.stage==='starter-ready-105'){
   while(hero.inventory.length<41)hero.inventory.push(world.item('potion'));
   for(let i=0;i<6;i++)Object.assign(hero,recordStarterQuestEvent(hero,{kind:'kill',speciesId:'v3_armored_beetle',entityUid:'qa-beetle-'+i,generation:1,locationId:'L02'}));
   Object.assign(hero,recordStarterQuestEvent(hero,{kind:'cityReturn',cityId:'greenfall',safe:true,locationId:'L02'}));
  }
  else if(request.stage==='starter-free-cell'){
   const index=hero.inventory.findIndex(i=>i.id==='potion');assert.ok(index>=0);hero.inventory.splice(index,1);
  }
  else if(request.stage==='craft-v3'){
   const recipe=RING_RECIPES.find(r=>r.id==='ring_str_g1');
   hero.inventory=[world.item(recipe.targetId),...recipe.materials.map(m=>world.item(m.id,m.count))];
   hero.gold=1000;world.random=()=>0;
   const earId=Object.entries(ITEMS).find(([,d])=>d.slot==='ear'||d.slot==='earring')[0];
   hero.migrationReserve=[world.item(earId)];
   world.relocate(hero,{...geography.services['npc:smith'],x:geography.services['npc:smith'].x+2});
  }
  else if(request.stage==='cave-entrance'){world.relocate(hero,{x:245,z:278,spaceId:'surface'});hero.hp=hero.maxHp;}
  else if(request.stage==='cave-finish'){
   // Keep the native regression short after observing real damage/animation.
   // The production definition remains 14400 HP; loot/respawn use normal death.
   if(!boss?.alive||boss.hp>=14400)throw Error('native boss has not taken a real hit');
   boss.hp=Math.min(boss.hp,120);hero.hp=hero.maxHp;
  }else throw Error('unknown-stage-fixture:'+request.stage);
  world.checkpoint();
  // Godot polls this file concurrently. Publish the complete fixture in one
  // rename so it cannot read an empty/truncated JSON document mid-write.
  const ready=join(output,'fixture-ready.json');
  writeFileSync(ready+'.tmp',JSON.stringify({stage:request.stage,generation:hero.generation,...extra}));
  renameSync(ready+'.tmp',ready);
 },100);
 const bootstrap=join(output,'bootstrap.json');writeFileSync(bootstrap,JSON.stringify({server_url,profiles:[{id:p.id,token:session.token,name:p.name,classId:p.classId,level:p.level}]}));
 const mode=packageArg?['--packaged','--cwd',dirname(resolve(binary))]:['--project','godot-pc'];
 if(qaUserRootArg)mode.push('--qa-user-root',resolve(qaUserRootArg.slice('--qa-user-root='.length)));
 const args=['-X','utf8','scripts/godot_run_checked.py','--exe',resolve(binary),...mode,'--output',join(output,'native'),'--timeout','360','--',...options.filter(x=>x==='--headless'),'--audio-driver','Dummy','--',`--bootstrap=${bootstrap}`,`--qa=${join(output,reportName)}`,`--qa-scope=${castlePreview?'castle-preview':castle?'castle':'stage'}`,...(packageArg?['--qa-packaged']:[]),...options.filter(x=>x.startsWith('--block='))];
 if(options.includes('--qa-graphics=low'))args.push('--qa-graphics=low');
 const process=spawn(globalThis.process.env.PYTHON??'python',args,{stdio:'inherit',windowsHide:true});const [code]=await once(process,'exit');assert.equal(code,0);
 const report=JSON.parse(readFileSync(join(output,reportName),'utf8'));assert.equal(report.ok,true,JSON.stringify(report.checks));
 assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(readFileSync(join(output,'native/engine.log'),'utf8')));
 console.log(JSON.stringify({checks:report.checks,ok:true}));
}finally{clearInterval(fixtureTimer);if(bridge)await bridge.close();else await service.close();}
