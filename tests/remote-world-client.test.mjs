import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WorldEventCursor, reconcilePosition } from '../src/network/client-world-state.ts';
import { RemoteWorldGateway } from '../src/network/remote-world-gateway.ts';
import { startWorldServer } from '../server/http-server.mjs';
import { CollisionWorld } from '../src/world/collision-world.ts';

class MemoryStorage {
  values=new Map();
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('client condition timeout');await new Promise(resolve=>setTimeout(resolve,20));}}

test('Resuming repeated event windows never replays old attacks or awards, and skips stale visuals',()=>{
  const cursor=new WorldEventCursor();
  const event=(sequence,at=10_000)=>({sequence,at,kind:'attack',actor:'hero'});
  assert.deepEqual(cursor.consume([event(3),event(4)],10_000),[]);
  assert.deepEqual(cursor.consume([event(3),event(4),event(5)],10_100).map(e=>e.sequence),[5]);
  assert.deepEqual(cursor.consume([event(4),event(5)],10_200),[]);
  assert.deepEqual(cursor.consume([event(6)],15_000),[]);
  assert.deepEqual(cursor.consume([event(7,15_000)],15_000).map(e=>e.sequence),[7]);
  assert.equal(cursor.lastSequence,7);
});

test('Small authoritative corrections converge; teleport/respawn positions are applied immediately',()=>{
  const from={x:0,z:0},to={x:1,z:2};
  const corrected=reconcilePosition(from,to,.1);
  assert.ok(corrected.x>0&&corrected.x<1);assert.ok(corrected.z>0&&corrected.z<2);
  assert.deepEqual(reconcilePosition(from,to,.01,true),to);
  assert.deepEqual(reconcilePosition(from,{x:100,z:-80},.01),{x:100,z:-80});
  assert.deepEqual(reconcilePosition(from,to,0),from);
});

test('Lost enhancement response is recovered with one receipt; input rejection does not disconnect a healthy stream',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'varendor-client-'));
  const server=startWorldServer({database:join(directory,'world.sqlite'),collision:new CollisionWorld(),port:0,beta:true});
  if(!server.server.listening)await once(server.server,'listening');
  const base=`http://127.0.0.1:${server.server.address().port}/api`;
  const storage=new MemoryStorage();storage.setItem('varendor_reborn_v03','original-local-save');
  let loseResponse=true,commandRequests=[];
  async function fetcher(url,options){
    assert.equal(this,undefined,'transport must not receive the gateway as its receiver (browser Window.fetch brand check)');
    const response=await fetch(url,options);
    if(String(url).endsWith('/command')){
      commandRequests.push(JSON.parse(options.body));
      if(loseResponse){loseResponse=false;await response.json();throw TypeError('simulated lost response after commit');}
    }
    return response;
  };
  const gateway=new RemoteWorldGateway(storage,base,fetcher);
  let latest,connected=false,rejected='';
  gateway.onSnapshot=s=>{latest=s;};gateway.onConnection=value=>{connected=value;};gateway.onInputRejected=reason=>{rejected=reason;};
  try{
    await gateway.create('Сетевая проверка','knight');await until(()=>connected);
    const weapon=latest.character.equipment.weapon;
    const scroll=latest.character.inventory.find(i=>i.id==='weapon_scroll');
    assert.ok(scroll,'normal weapon scroll exists in beta grant');
    await assert.rejects(gateway.command({type:'enhance',item:{...weapon},scroll:{...scroll}},'network-attempt-0001'),/simulated lost response/);
    await until(()=>connected&&storage.getItem('varendor_world_pending_v1')===null&&latest.character.equipment.weapon.plus===1);
    assert.equal(commandRequests.length,2);assert.equal(commandRequests[0].id,commandRequests[1].id);
    assert.equal(latest.character.inventory.find(i=>i.uid===scroll.uid).count,99);
    assert.equal(storage.getItem('varendor_reborn_v03'),'original-local-save');
    gateway.sendIntent({type:'attack',entityId:'missing-monster',skill:null});
    await until(()=>Boolean(rejected));assert.equal(connected,true);
    const time=latest.time;await until(()=>latest.time>time);
    const originalHero=latest.character.id;
    await gateway.create('Другой класс','mage');
    assert.equal(latest.character.classId,'mage');assert.notEqual(latest.character.id,originalHero);
    assert.equal(gateway.profiles.length,2);
    assert.ok(gateway.profiles.every(profile=>!Object.hasOwn(profile,'token')),'UI profile list does not expose credentials');
    gateway.selectProfile(originalHero);await gateway.resume();
    assert.equal(latest.character.id,originalHero);
    assert.equal(latest.character.equipment.weapon.plus,1);
    assert.equal(latest.character.inventory.find(i=>i.uid===scroll.uid).count,99);
  }finally{gateway.close();await server.close();await rm(directory,{recursive:true,force:true});}
});
