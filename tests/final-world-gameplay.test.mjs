import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stageNativeServer} from '../scripts/package-godot-pc.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {MONSTERS,CLASSES} from '../src/data/game-data.ts';
import {sameSpace} from '../src/world/world-space.ts';
import {pathSegmentIsClear} from '../src/world/navigation.ts';

const geography=new FinalWorld();
test('forest road-to-slime route crosses the formerly forbidden hillside in both directions while trunks remain solid',()=>{
 const route=JSON.parse(readFileSync('scripts/world_final/forest-route.json','utf8'));
 const space=geography.spaces.surface,c=space.collision,t=space.terrain;
 let position={...route.start},length=0;
 const points=[...route.points,...route.points.slice(0,-1).reverse(),route.start];
 for(const goal of points){
  let budget=2000;
  while(Math.hypot(position.x-goal.x,position.z-goal.z)>.025&&budget-->0){
   const dx=goal.x-position.x,dz=goal.z-position.z,d=Math.hypot(dx,dz),step=Math.min(.12,d);
   const next=c.resolve(position,{x:dx/d*step,z:dz/d*step},.46);
   assert.ok(Math.hypot(next.x-position.x,next.z-position.z)>.01,'No invisible hillside barrier');
   length+=step;position=next;
  }
  assert.ok(budget>0);
 }
 assert.ok(length>80);assert.ok(Math.hypot(position.x-route.start.x,position.z-route.start.z)<.03);
 const p=route.steepPoint;
 const gradient=Math.hypot(t.supportAt(p.x+.5,p.z)-t.supportAt(p.x-.5,p.z),t.supportAt(p.x,p.z+.5)-t.supportAt(p.x,p.z-.5));
 assert.ok(gradient>Math.tan(20*Math.PI/180)+.015);assert.ok(geography.walkable(space,p,.46));
 const trees=JSON.parse(readFileSync('godot-pc/world-final/nature/collision-D13.json','utf8')).obstacles;
 const tree=trees.find(o=>o.kind==='circle'&&Math.hypot(o.x-p.x,o.z-p.z)<15);
 assert.ok(tree);assert.equal(c.isBlocked(tree,.46),true,'Tree trunks must still block movement');
});
class MemoryStore {
 saved=null;receipts=new Map();
 load(){return this.saved?structuredClone(this.saved):null;}
 save(s){this.saved=structuredClone(s);}
 receipt(p,id){return this.receipts.get(p+id)??null;}
 commit(s,p,id,_command,r){this.save(s);this.receipts.set(p+id,r);}
}
let serial=0;
function create(store=new MemoryStore(),now=1000,final=true){
 return new WorldSimulation({store,now,identifier:()=>`fg-test-${++serial}`,random:()=>.5,beta:true,
  collision:final?geography.spaces.surface.collision:new CollisionWorld(),terrain:final?geography.spaces.surface.terrain:undefined,finalWorld:final?geography:undefined});
}
function stand(w,p,point){
 const free=geography.space(point).collision.findNearestFree(point,.46);
 Object.assign(p,free,{spaceId:point.spaceId??'surface',direction:{x:0,z:0},destination:null,activeUntil:w.state.time+30000});
}
function step(w,ms){const end=w.state.time+ms;while(w.state.time+17<end){for(const p of Object.values(w.state.characters))w.heartbeat(p.id);w.advance(Math.min(end,w.state.time+50));}w.advance(end);}

test('final runtime has the approved 1000 stable slots, all 15 species, exact location/subzone/space totals',()=>{
 const w=create(),spec=JSON.parse(readFileSync('docs/world-final/spec/WORLD_REQUIREMENTS.json','utf8'));
 assert.equal(w.state.monsters.length,1000);assert.equal(new Set(w.state.monsters.map(m=>m.uid)).size,1000);
 assert.equal(new Set(w.state.monsters.map(m=>m.id)).size,15);
 assert.equal(w.state.monsters.filter(m=>'boss' in MONSTERS[m.id]).length,3);
 for(const location of spec.locations){
  const slots=geography.slots.filter(s=>s.locationId===location.id);
  assert.equal(slots.filter(s=>!s.boss).length,location.regular,location.id);
  assert.equal(slots.filter(s=>s.boss).length,location.bosses,location.id);
  for(const sub of location.subzones??[])assert.equal(slots.filter(s=>s.subzoneId===sub.id).length,sub.regular+sub.bosses,sub.id);
 }
 for(const space of spec.spaces)assert.equal(w.state.monsters.filter(m=>m.spaceId===space.id).length,space.total);
 for(const slot of geography.slots){
  const c=geography.space(slot).collision,m=w.state.monsters.find(m=>m.uid===slot.uid),radius=w.bodyRadius(m);
  assert.equal(m.home.x,slot.x,slot.uid);assert.equal(m.home.z,slot.z,slot.uid);
  assert.equal(c.isBlocked(slot,radius),false,slot.uid);assert.equal(geography.safe(slot,15),false,slot.uid);
  assert.ok(Number.isFinite(geography.space(slot).terrain.supportAt(slot.x,slot.z)));
  for(const p of slot.patrol){assert.equal(c.isBlocked(p,radius),false,slot.uid);assert.ok(pathSegmentIsClear(c,slot,p,radius),slot.uid);}
 }
});

test('portable server contains complete final geography and restores the same 1000 identities',async()=>{
 const parent=resolve('..'),temp=mkdtempSync(join(parent,'.final-world-bridge-')),stage=join(temp,'application');
 let bridge;
 try{
  stageNativeServer(resolve('.'),stage,{finalWorld:true});
  const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
  const options={data:join(temp,'save'),backups:join(temp,'backups')};
  bridge=await startNativeBridge(options);
  const world=bridge.service.world,p=world.createCharacter('Переносимый мир','knight');
  assert.equal(world.finalWorld.mapVersion,geography.mapVersion);
  assert.equal(world.snapshot(p.id).worldRevision,geography.revision);
  assert.equal(world.state.monsters.length,1000);
  const ids=world.state.monsters.map(m=>m.uid);world.checkpoint();await bridge.close();bridge=null;
  bridge=await startNativeBridge(options);
  assert.deepEqual(bridge.service.world.state.monsters.map(m=>m.uid),ids);
 }finally{if(bridge)await bridge.close();assert.ok(resolve(temp).startsWith(parent+sep));rmSync(temp,{recursive:true,force:true});}
});

test('boss phase summons are explicitly temporary, never respawn or displace the 1000 permanent slots',()=>{
 const w=create(),p=w.createCharacter('Призыв босса','knight'),boss=w.state.monsters.find(m=>m.id==='big');
 stand(w,p,{...boss,x:boss.x+5});
 w.damage(boss,Math.ceil(MONSTERS.big.hp*.4),p,false);
 const temporary=w.state.monsters.filter(m=>m.temporaryOwner===boss.uid);
 assert.ok(temporary.length>0);
 for(const m of temporary){assert.equal(m.ownerGeneration,boss.generation);assert.ok(m.temporaryUntil>w.state.time);assert.equal(geography.space(m).collision.isBlocked(m,.46),false);}
 assert.equal(w.state.monsters.filter(m=>!m.temporaryOwner).length,1000);
 w.damage(boss,boss.hp+1,p,false);step(w,100);
 assert.equal(w.state.monsters.some(m=>m.temporaryOwner===boss.uid),false);
 w.advance(w.state.time+121000);
 assert.equal(w.state.monsters.filter(m=>!m.temporaryOwner).length,1000);
 assert.equal(w.state.monsters.some(m=>temporary.some(t=>t.uid===m.uid)),false);
});

test('legacy hero migrates once; gear, item UIDs, storage, level and progression survive restart and portal round trips',()=>{
 const store=new MemoryStore(),legacy=create(store,1000,false),p=legacy.createCharacter('Перенос','knight');
 p.level=27;p.xp=431;p.gold=5000;p.quest=3;p.kills=123;p.storage=[{id:'potion',uid:'saved-storage-stack',plus:0,count:77}];p.inventory[0].plus=3;
 legacy.checkpoint();const before=structuredClone(p);
 let w=create(store,legacy.state.time),hero=w.state.characters[p.id];
 for(const key of ['level','xp','gold','quest','kills','storage','inventory','equipment'])assert.deepEqual(hero[key],before[key],key);
 assert.equal(hero.spaceId,'surface');assert.equal(hero.x,geography.start.x);assert.equal(hero.z,geography.start.z);
 assert.equal(w.state.coordinateMigrations.length,1);assert.ok(w.state.previousWorld.monsters.length>0);
 for(const id of ['mine','great_cave']){
  const def=geography.spaces[id].definition;
  stand(w,hero,{x:def.surface_portal[0],z:-def.surface_portal[2],spaceId:'surface'});
  let r=w.command(hero.id,`enter-${id}`,{type:'portal',destination:id});assert.equal(r.ok,true,r.reason);assert.equal(hero.spaceId,id);assert.equal(hero.level,27);
  w.checkpoint();w=create(store,w.state.time);hero=w.state.characters[hero.id];assert.equal(hero.spaceId,id);assert.equal(hero.level,27);
  r=w.command(hero.id,`exit-${id}`,{type:'portal',destination:id});assert.equal(r.ok,true,r.reason);assert.equal(hero.spaceId,'surface');assert.equal(hero.level,27);
 }
 const npc=geography.services['npc:teleport'];stand(w,hero,npc);
 const r=w.command(hero.id,'teleport-keep-level',{type:'teleport',destination:'Астерхолд'});assert.equal(r.ok,true,r.reason);assert.equal(hero.level,27);
 assert.deepEqual(hero.storage,before.storage);assert.deepEqual(hero.inventory,before.inventory);
 assert.equal(w.state.monsters.filter(m=>!m.temporaryOwner).length,1000);
});

test('identical local coordinates in separate spaces never aggro, block or damage each other; streaming retains identity and HP',()=>{
 const w=create(),p=w.createCharacter('Шахта','knight'),observer=w.createCharacter('Пещера','knight');
 const m=w.state.monsters.find(m=>m.spaceId==='mine');
 stand(w,p,{x:m.x+3,z:m.z,spaceId:'great_cave'});stand(w,observer,{x:m.x+3,z:m.z,spaceId:'surface'});
 assert.throws(()=>w.input(p.id,1,{type:'attack',entityId:m.uid,skill:null,mode:'auto'}),/missing-target/);
 step(w,500);assert.notEqual(m.targetId,p.id);assert.notEqual(m.targetId,observer.id);
 for(const h of [p,observer])assert.ok(w.snapshot(h.id).monsters.every(m=>sameSpace(m,h)));
 stand(w,p,{...m,x:m.x+12});m.hp-=17;const hp=m.hp,generation=m.generation;
 assert.ok(w.snapshot(p.id).monsters.some(n=>n.uid===m.uid&&n.hp===hp));
 stand(w,p,{...geography.start});w.snapshot(p.id);stand(w,p,{...m,x:m.x+12});
 assert.equal(w.snapshot(p.id).monsters.find(n=>n.uid===m.uid).hp,hp);assert.equal(m.generation,generation);
 assert.equal(w.state.monsters.length,1000);
});

test('new map bounds permit live motion beyond old edges and stop on the first neutral step',()=>{
 const w=create(),p=w.createCharacter('Движение','knight');
 stand(w,p,geography.services['npc:asterhold:teleport']);
 w.input(p.id,1,{type:'direction',x:1,z:0});step(w,250);assert.ok(p.x<-156);
 w.input(p.id,2,{type:'direction',x:0,z:0});const before={x:p.x,z:p.z};step(w,250);
 assert.equal(p.x,before.x);assert.equal(p.z,before.z);
});

test('existing authoritative AI and autoattack kill a real final-world monster; death, loot and respawn survive restart',()=>{
 const store=new MemoryStore();let w=create(store),p=w.createCharacter('Бой','knight');
 const slot=geography.slots.find(s=>s.speciesId==='exile'&&s.spaceId==='surface');let m=w.state.monsters.find(m=>m.uid===slot.uid);
 // A synthetic level-40 save uses the existing stat calculation and starter
 // items. The real monster's HP, damage and attack/respawn timing are untouched.
 p.level=40;w.recalculate(p);p.hp=p.maxHp;
 for(const itemId of [CLASSES.knight.weapon,CLASSES.knight.armor]){
  const item=p.inventory.find(i=>i.id===itemId);assert.ok(item);
  const r=w.command(p.id,'equip-test-'+itemId,{type:'equip',item:structuredClone(item)});assert.equal(r.ok,true,r.reason);
 }
 stand(w,p,{...m,x:m.x+3});
 w.input(p.id,1,{type:'attack',entityId:m.uid,skill:null,mode:'auto'});
 for(let i=0;i<200&&m.alive&&!p.dead;i++)step(w,100);
 assert.equal(m.alive,false,'server autoattack must kill its actual target');
 assert.ok(m.respawnAt>w.state.time);assert.ok(w.events.some(e=>e.kind==='loot'&&e.target===m.uid));
 const deadline=m.respawnAt,gen=m.generation,kills=p.kills,xp=p.xp;
 w.checkpoint();w=create(store,w.state.time);p=w.state.characters[p.id];m=w.state.monsters.find(n=>n.uid===m.uid);
 assert.equal(m.alive,false);assert.equal(m.respawnAt,deadline);assert.equal(p.kills,kills);assert.equal(p.xp,xp);
 p.activeUntil=0;w.advance(deadline+50);assert.equal(m.alive,true);assert.equal(m.generation,gen+1);assert.equal(m.hp,MONSTERS[m.id].hp);
 assert.equal(w.state.monsters.filter(n=>!n.temporaryOwner).length,1000);
});
