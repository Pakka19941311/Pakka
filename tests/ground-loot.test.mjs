import test from 'node:test';
import assert from 'node:assert/strict';
import {planGroundPickup} from '../src/core/ground-loot.ts';
import {makeP2Simulation,makeP2Geography} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {WorldStore} from '../server/world-store.mjs';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';

const geography=makeP2Geography();
const item=(uid,id='potion',count=1)=>({uid,id,count,plus:0});
function fixture(){
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Ground loot QA','knight');
 sim.heartbeat(p.id);p.inventory=[];p.gold=50;
 const chest={id:'loot:fixture',ownerId:p.id,sourceUid:'fixture:monster',sourceGeneration:1,
  x:p.x,z:p.z,spaceId:'surface',createdAt:sim.state.time,revision:0,gold:123,items:[item('drop:one','potion',10)]};
 sim.state.groundLoot[chest.id]=chest;
 return {sim,p,chest};
}
function pickup(sim,p,chest,id='pickup-test-0001'){return sim.command(p.id,id,{type:'pickup',lootId:chest.id});}

test('partial stack fills available room; full bag retains UID and remaining items without mutating inputs',()=>{
 const bag=[item('bag:potion','potion',8),item('bag:sword','sword')];
 const chest={gold:2,items:[item('ground:potion','potion',5),item('ground:sword','sword')]};
 const before=structuredClone({bag,chest});
 const result=planGroundPickup(bag,10,chest,{potion:{maxStack:10},sword:{slot:'weapon'}},2);
 assert.deepEqual(result.inventory,[item('bag:potion','potion',10),item('bag:sword','sword')]);
 assert.deepEqual(result.remaining,[item('ground:potion','potion',3),item('ground:sword','sword')]);
 assert.equal(result.gold,12);assert.equal(result.collected[0].count,2);assert.equal(result.empty,false);
 assert.deepEqual({bag,chest},before);
});

test('manual pickup is atomic, idempotent and persists empty chest removal across reload',()=>{
 const {sim,p,chest}=fixture();assert.equal(sim.snapshot(p.id).character.lootMode,'ground');
 const result=pickup(sim,p,chest);assert.equal(result.ok,true);assert.equal(p.gold,173);assert.equal(p.inventory[0].count,10);
 assert.equal(sim.state.groundLoot[chest.id],undefined);assert.deepEqual(pickup(sim,p,chest),result);
 assert.equal(p.gold,173);assert.equal(p.inventory[0].count,10);
 const restored=makeP2Simulation({geography,store:sim.store,now:sim.state.time});
 assert.equal(restored.state.groundLoot[chest.id],undefined);assert.equal(restored.state.characters[p.id].gold,173);
 assert.equal(pickup(restored,p,chest,'pickup-test-0002').ok,false);
});

test('save failure restores both purse, inventory and chest; retry collects only once',()=>{
 const {sim,p,chest}=fixture(),before=structuredClone(sim.state),commit=sim.store.commit.bind(sim.store);
 sim.store.commit=()=>{throw Error('disk-full-fixture');};
 assert.throws(()=>pickup(sim,p,chest),/disk-full-fixture/);assert.deepEqual(sim.state,before);
 sim.store.commit=commit;assert.equal(pickup(sim,p,chest).ok,true);
 assert.equal(sim.state.characters[p.id].gold,173);assert.equal(sim.state.characters[p.id].inventory[0].count,10);
});

test('full inventory collects only gold, leaves items, and collect-buffer cannot bypass the chest',()=>{
 const {sim,p,chest}=fixture();p.inventory=Array.from({length:42},(_,i)=>item('full:'+i,'starter_weapon_knight'));
 assert.equal(pickup(sim,p,chest).ok,true);assert.equal(p.gold,173);assert.equal(chest.gold,0);assert.equal(chest.items[0].count,10);
 const retry=pickup(sim,p,chest,'pickup-test-0002');assert.equal(retry.reason,'bag-full');
 assert.equal(sim.command(p.id,'old-buffer-0001',{type:'collect'}).ok,true);
 assert.equal(sim.state.groundLoot[chest.id].items[0].count,10);
 const current=sim.state.characters[p.id];current.inventory.pop();
 assert.equal(pickup(sim,current,chest,'pickup-test-0003').ok,true);assert.equal(current.gold,173);
 assert.equal(current.inventory.at(-1).count,10);
});

test('ownership, space, distance, wall, height and death are checked by the server',()=>{
 const {sim,p,chest}=fixture();let serial=0;
 const reject=()=>{const before=structuredClone(sim.state);assert.equal(pickup(sim,sim.state.characters[p.id],chest,'rejected-pickup-'+(++serial)).ok,false);
  assert.deepEqual(sim.state.characters[p.id],before.characters[p.id]);assert.deepEqual(sim.state.groundLoot,before.groundLoot);};
 for(const changes of [{ownerId:'someone-else'},{spaceId:'great_cave'},{x:p.x+3}]){
  Object.assign(sim.state.groundLoot[chest.id],changes);reject();sim.state.groundLoot[chest.id]=structuredClone(chest);
  Object.assign(sim.state.groundLoot[chest.id],{ownerId:p.id,spaceId:'surface',x:p.x});
 }
 const line=sim.lineOfSight;sim.lineOfSight=()=>false;reject();sim.lineOfSight=line;
 sim.state.characters[p.id].yOffset=4;reject();sim.state.characters[p.id].yOffset=0;
 sim.state.characters[p.id].grounded=false;reject();sim.state.characters[p.id].grounded=true;
 sim.state.characters[p.id].dead=true;reject();
});

test('automatic mode uses the same nearby pickup and preserves direction, selection and mode after reload',()=>{
 const {sim,p,chest}=fixture();p.direction={x:0,z:1};p.target='selected-only';
 assert.equal(sim.command(p.id,'loot-mode-0001',{type:'lootMode',mode:'auto'}).ok,true);
 sim.autoLoot();assert.equal(p.gold,173);assert.deepEqual(p.direction,{x:0,z:1});assert.equal(p.target,'selected-only');
 assert.equal(sim.state.groundLoot[chest.id],undefined);
 const restored=makeP2Simulation({geography,store:sim.store,now:sim.state.time});assert.equal(restored.state.characters[p.id].lootMode,'auto');
});

test('death rolls one persistent chest and immediate XP; second damage and reload never reroll contents',()=>{
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Death drop QA','knight');
 const m=sim.state.monsters.find(m=>m.canonicalMobId==='MOB-03');Object.assign(p,{x:m.x,z:m.z});sim.heartbeat(p.id);
 const before={gold:p.gold,xp:p.xp,inventory:structuredClone(p.inventory)};
 sim.damage(m,m.hp,p,false);assert.equal(m.alive,false);
 const loot=Object.values(sim.state.groundLoot);assert.equal(loot.length,1);assert.equal(loot[0].sourceUid,m.uid);
 assert.equal(p.gold,before.gold);assert.deepEqual(p.inventory,before.inventory);assert.ok(p.xp>before.xp);
 const content=structuredClone(loot);sim.damage(m,1,p,false);assert.deepEqual(Object.values(sim.state.groundLoot),content);
 const restored=makeP2Simulation({geography,store:sim.store,now:sim.state.time});
 assert.deepEqual(Object.values(restored.state.groundLoot),content);assert.equal(restored.state.characters[p.id].gold,before.gold);
});

test('snapshot shows only owner and current-space chests, nearest first with a bounded visual budget',()=>{
 const {sim,p,chest}=fixture();for(let i=0;i<80;i++)sim.state.groundLoot['near:'+i]={...chest,id:'near:'+i,x:p.x+1+i*.01};
 sim.state.groundLoot.foreign={...chest,id:'foreign',ownerId:'someone-else'};
 sim.state.groundLoot.interior={...chest,id:'interior',spaceId:'great_cave'};
 const view=sim.snapshot(p.id).groundLoot;assert.equal(view.length,64);assert.equal(view[0].id,chest.id);
 assert.ok(view.every(v=>v.id!=='foreign'&&v.id!=='interior'));assert.equal('items' in view[0],false);
});

test('SQLite restart retains unopened chest and durable pickup receipt, including a lost response',()=>{
 const folder=mkdtempSync(join(tmpdir(),'varendor-ground-loot-')),file=join(folder,'world.sqlite');
 let store=new WorldStore(file);
 try{
  const {sim,p,chest}=fixture();store.save(sim.state);store.close();store=new WorldStore(file);
  let loaded=makeP2Simulation({geography,store,now:sim.state.time});loaded.heartbeat(p.id);
  assert.deepEqual(loaded.state.groundLoot[chest.id],chest);
  const receipt=pickup(loaded,p,chest);assert.equal(receipt.ok,true);store.close();store=new WorldStore(file);
  loaded=makeP2Simulation({geography,store,now:sim.state.time});
  assert.deepEqual(pickup(loaded,p,chest),receipt);assert.equal(loaded.state.characters[p.id].gold,173);
  assert.equal(loaded.state.characters[p.id].inventory[0].count,10);assert.equal(loaded.state.groundLoot[chest.id],undefined);
 }finally{
  store.close();const target=realpathSync(folder);
  assert.equal(dirname(target),realpathSync(tmpdir()));assert.ok(basename(target).startsWith('varendor-ground-loot-'));
  rmSync(target,{recursive:true,force:true});
 }
});
