import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {FinalWorld} from '../src/world/final-world.ts';
import {SERVICES} from '../src/world/territory.ts';
import {ITEMS} from '../src/data/game-data.ts';
import {startWorldServer} from '../server/http-server.mjs';

class MemoryStore {
 state=null;receipts=new Map();fail=false;
 load(){return this.state?structuredClone(this.state):null;}
 save(state){this.state=structuredClone(state);}
 receipt(hero,id){return this.receipts.get(hero+id);}
 commit(state,hero,id,command,receipt){if(this.fail)throw Error('disk failure');this.save(state);this.receipts.set(hero+id,receipt);}
}
const flat={heights:new Float32Array(),heightAt:()=>0,supportAt:()=>0,platformManifest:()=>[]};
function fixture(finalWorld){
 let serial=0;const store=new MemoryStore(),collision=new CollisionWorld();
 const options={store,collision,terrain:flat,finalWorld,now:1000,identifier:()=>`trade-${++serial}`,random:()=>.5};
 const world=new WorldSimulation(options),id=world.createCharacter('Продажа','knight').id;world.heartbeat(id);world.state.monsters=[];
 const hero=()=>world.state.characters[id];hero().inventory=[{uid:'sale-stack',id:'potion',plus:0,count:10}];
 const command=value=>world.command(id,`trade-command-${++serial}`,value);
 const place=(npcId='npc:smith',offset=0)=>{const npc=(finalWorld?.services??SERVICES)[npcId];Object.assign(hero(),{x:npc.x+offset,z:npc.z,spaceId:'surface',yOffset:0,grounded:true});};
 const open=(npcId='npc:smith')=>{const result=command({type:'tradeOpen',npcId});assert.equal(result.ok,true,JSON.stringify(result));return result.outcome;};
 const sale=trade=>command({type:'sell',item:structuredClone(hero().inventory[0]),quantity:3,trade});
 return {world,store,collision,options,id,hero,command,place,open,sale};
}
const balances=hero=>structuredClone({gold:hero.gold,inventory:hero.inventory});

test('only the four authored city weapon vendors/alchemists accept 3 of 10 at the unchanged price',()=>{
 const finalWorld=new FinalWorld();
 for(const npcId of ['npc:smith','npc:asterhold:smith','npc:alchemist','npc:asterhold:alchemist']){
  const f=fixture(finalWorld);f.place(npcId);const before=f.hero().gold,trade=f.open(npcId);
  assert.equal(trade.npcId,npcId);assert.equal(trade.spaceId,'surface');assert.equal(trade.generation,f.hero().generation);
  assert.equal(f.sale(trade).ok,true);assert.equal(f.hero().inventory[0].count,7);
  assert.equal(f.hero().gold,before+3*Math.floor(ITEMS.potion.value*.48));
 }
});

test('forged field commands and shops without the seller role cannot open or sell',()=>{
 const f=fixture(new FinalWorld());Object.assign(f.hero(),{x:300,z:300,spaceId:'surface'});const before=balances(f.hero());
 assert.equal(f.sale(undefined).reason,'trade-session-required');
 assert.equal(f.sale({npcId:'npc:smith',token:'forged-server-token'}).reason,'trade-session-required');
 assert.equal(f.command({type:'tradeOpen',npcId:'npc:smith'}).ok,false);
 for(const npcId of ['npc:shop','npc:asterhold:shop','npc:books','npc:elder','npc:field:smith','npc:missing']){
  if(f.world.finalWorld.services[npcId])f.place(npcId);
  assert.equal(f.command({type:'tradeOpen',npcId}).reason,'merchant-unavailable',npcId);
  assert.equal(f.sale({npcId,token:'forged-server-token'}).reason,'trade-session-required',npcId);
 }
 assert.deepEqual(balances(f.hero()),before);
});

test('a real session is bound to its NPC and authenticated hero, and reopening replaces its token',()=>{
 const f=fixture();f.place();const first=f.open(),before=balances(f.hero());
 for(const trade of [undefined,{}, {npcId:'npc:shop',token:first.token},{npcId:first.npcId,token:'fake'}])assert.equal(f.sale(trade).reason,'trade-session-required');
 const other=f.world.createCharacter('Другой','knight');Object.assign(other,{x:f.hero().x,z:f.hero().z});
 other.inventory=[{uid:'other-stack',id:'potion',plus:0,count:10}];const otherBefore=balances(other);
 assert.equal(f.world.command(other.id,'other-hero-sale',{type:'sell',item:structuredClone(other.inventory[0]),quantity:3,trade:first}).reason,'trade-session-required');
 assert.deepEqual(balances(f.world.state.characters[other.id]),otherBefore);
 const second=f.open();assert.notEqual(first.token,second.token);assert.equal(f.sale(first).reason,'trade-session-required');
 assert.deepEqual(balances(f.hero()),before);assert.equal(f.sale(second).ok,true);
});

test('server movement out of range revokes the session even after returning without a failed sale',()=>{
 const f=fixture();f.place();const trade=f.open(),before=balances(f.hero());
 f.world.input(f.id,1,{type:'destination',x:f.hero().x+15,z:f.hero().z});f.world.advance(2500);
 assert.ok(Math.abs(f.hero().x-SERVICES['npc:smith'].x)>3.2);
 f.place();assert.equal(f.sale(trade).reason,'trade-session-required');assert.deepEqual(balances(f.hero()),before);
});

test('range includes height and an intervening wall revokes LOS access',()=>{
 const f=fixture();f.place('npc:smith',2);const trade=f.open(),before=balances(f.hero());
 f.collision.addBox(SERVICES['npc:smith'].x+1,SERVICES['npc:smith'].z,.12,1,0,0,4);
 assert.equal(f.sale(trade).reason,'trade-session-required');
 assert.equal(f.command({type:'tradeOpen',npcId:'npc:smith'}).reason,'merchant-occluded');
 f.collision.clear();assert.equal(f.sale(trade).reason,'trade-session-required');
 f.hero().yOffset=5;assert.equal(f.command({type:'tradeOpen',npcId:'npc:smith'}).reason,'merchant-out-of-range');
 assert.deepEqual(balances(f.hero()),before);
});

test('a seller moved outside the actual city outline does not gain authority from a generic safe area',()=>{
 const finalWorld=new FinalWorld(),f=fixture(finalWorld);
 Object.assign(finalWorld.services['npc:smith'],{x:427,z:-57});f.place();
 assert.equal(finalWorld.safe(f.hero()),true,'castle courtyard is safe but is not an approved trading city');
 assert.equal(f.command({type:'tradeOpen',npcId:'npc:smith'}).reason,'merchant-unavailable');
});

test('space changes, relocation, generation, death, disconnect and explicit close revoke old capabilities',()=>{
 for(const kind of ['space','relocate','generation','death','disconnect','close','inactive']){
  const f=fixture();f.place();const trade=f.open();
  if(kind==='space'){f.hero().spaceId='mine';f.world.advance(1020);f.hero().spaceId='surface';}
  if(kind==='relocate'){
   const item={uid:'return-scroll',id:'teleport',plus:0,count:1};f.hero().inventory.push(item);
   assert.equal(f.command({type:'use',item:structuredClone(item)}).ok,true);f.place();
  }
  if(kind==='generation'){f.hero().generation++;f.world.advance(1020);}
  if(kind==='death'){f.hero().dead=true;f.world.advance(1020);f.hero().dead=false;}
  if(kind==='disconnect'){f.world.disconnect(f.id);f.world.heartbeat(f.id);}
  if(kind==='close')assert.equal(f.command({type:'tradeClose',token:trade.token}).ok,true);
  if(kind==='inactive'){f.hero().activeUntil=f.world.state.time;f.world.heartbeat(f.id);}
  const before=balances(f.hero());assert.equal(f.sale(trade).reason,'trade-session-required',kind);assert.deepEqual(balances(f.hero()),before,kind);
 }
});

test('restart and replay of an opening receipt cannot restore an obsolete runtime capability',()=>{
 const f=fixture();f.place();const receipt=f.world.command(f.id,'open-before-restart',{type:'tradeOpen',npcId:'npc:smith'}),trade=receipt.outcome;
 assert.equal(receipt.ok,true);
 const world=new WorldSimulation(f.options);world.heartbeat(f.id);const p=world.state.characters[f.id],before=balances(p);
 assert.deepEqual(world.command(f.id,'open-before-restart',{type:'tradeOpen',npcId:'npc:smith'}),receipt);
 assert.equal(world.command(f.id,'sale-after-restart',{type:'sell',item:structuredClone(p.inventory[0]),quantity:3,trade}).reason,'trade-session-required');
 assert.deepEqual(balances(world.state.characters[f.id]),before);
});

test('failed session persistence never publishes a usable new token and preserves a committed session',()=>{
 const f=fixture();f.place();const trade=f.open();f.store.fail=true;
 assert.throws(()=>f.command({type:'tradeOpen',npcId:'npc:smith'}),/disk failure/);
 assert.throws(()=>f.command({type:'tradeClose',token:trade.token}),/disk failure/);
 f.store.fail=false;assert.equal(f.sale(trade).ok,true);
});

test('real HTTP transport rejects field/wrong-NPC/stale sessions and commits partial sales once',async t=>{
 const running=startWorldServer({database:':memory:',collision:new CollisionWorld(),terrain:flat,port:0,now:()=>1000});
 t.after(()=>running.close());await once(running.server,'listening');
 const base=`http://127.0.0.1:${running.server.address().port}`;let serial=0;
 const post=async(path,body,token)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const session=(await post('/api/session',{name:'HTTP торговля',classId:'knight'})).body;
 const id=session.snapshot.character.id,hero=()=>running.world.state.characters[id];running.world.state.monsters=[];
 hero().inventory=[{uid:'http-stack',id:'potion',plus:0,count:10}];Object.assign(hero(),{x:100,z:100});
 const send=(command,commandId=`http-trade-${++serial}`)=>post('/api/command',{id:commandId,command},session.token);
 const item=structuredClone(hero().inventory[0]),before=hero().gold;
 assert.equal((await post('/api/command',{id:'unauthenticated-sale',command:{type:'sell',item,quantity:3}})).status,401);
 assert.equal((await send({type:'sell',item,quantity:3,trade:{npcId:'npc:smith',token:'forged'}})).body.receipt.reason,'trade-session-required');
 Object.assign(hero(),{x:SERVICES['npc:shop'].x,z:SERVICES['npc:shop'].z});
 assert.equal((await send({type:'tradeOpen',npcId:'npc:shop'})).body.receipt.reason,'merchant-unavailable');
 Object.assign(hero(),{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});
 const opened=(await send({type:'tradeOpen',npcId:'npc:smith'})).body.receipt;assert.equal(opened.ok,true);
 const sale={type:'sell',item,quantity:3,trade:opened.outcome};
 assert.equal((await send(sale,'http-partial-once')).body.receipt.ok,true);
 assert.equal((await send(sale,'http-partial-once')).body.receipt.ok,true);
 assert.equal(hero().inventory[0].count,7);assert.equal(hero().gold,before+3*Math.floor(ITEMS.potion.value*.48));
 Object.assign(hero(),{x:100,z:100});
 assert.equal((await send({...sale,item:structuredClone(hero().inventory[0])})).body.receipt.reason,'trade-session-required');
 Object.assign(hero(),{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});
 assert.equal((await send({...sale,item:structuredClone(hero().inventory[0])})).body.receipt.reason,'trade-session-required');
 assert.equal(hero().inventory[0].count,7);assert.equal(hero().gold,before+3*Math.floor(ITEMS.potion.value*.48));
});
