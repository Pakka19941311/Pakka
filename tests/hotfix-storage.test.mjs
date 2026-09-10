import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SERVICES} from '../src/world/territory.ts';

function fixture(t){
 const root=resolve('.'),directory=mkdtempSync(join(root,'.hotfix-storage-'));let serial=0;
 const filename=join(directory,'world.sqlite');let store=new WorldStore(filename);
 const options=()=>({store,collision:new CollisionWorld(),now:1000,identifier:()=>`storage-${++serial}`,random:()=>.5});
 let world=new WorldSimulation(options());const id=world.createCharacter('Storage QA','knight').id;
 Object.assign(world.state.characters[id],SERVICES['npc:storage']);
 world.state.characters[id].inventory=[];world.state.characters[id].storage=[];
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(root+sep));rmSync(directory,{recursive:true,force:true});});
 return {get w(){return world;},get p(){return world.state.characters[id];},get store(){return store;},id,
  item:(id,count=1,plus=0)=>({uid:`item-${++serial}`,id,count,plus}),
  send:(c,key=`command-${++serial}`)=>world.command(id,key,structuredClone(c)),
  restart:()=>{store.close();store=new WorldStore(filename);world=new WorldSimulation(options());}};
}
const command=(direction,item,extra={})=>({type:'storage',direction,item:structuredClone(item),...extra});
test('partial deposit and withdrawal conserve counts and identities across a SQLite restart',t=>{
 const f=fixture(t),item=f.item('potion',20);f.p.inventory.push(item);
 const request=command('deposit',item,{quantity:7,index:499});const receipt=f.send(request,'split-once');assert.equal(receipt.ok,true);
 assert.equal(f.p.inventory[0].count,13);assert.equal(f.p.storage[499].count,7);assert.notEqual(f.p.storage[499].uid,item.uid);
 assert.deepEqual(f.send(request,'split-once'),receipt);f.restart();assert.deepEqual(f.send(request,'split-once'),receipt);
 assert.equal(f.p.inventory[0].count,13);assert.equal(f.p.storage[499].count,7);
 assert.equal(f.send(command('withdraw',f.p.storage[499],{quantity:3})).ok,true);
 assert.equal(f.p.inventory[0].uid,item.uid);assert.equal(f.p.inventory[0].count,16);assert.equal(f.p.storage[499].count,4);
 f.restart();assert.equal(f.p.inventory[0].count+f.p.storage[499].count,20);
});
test('full bag accepts a compatible stack but rejects new gear without deleting storage',t=>{
 const f=fixture(t);f.p.inventory=[f.item('potion',20),...Array.from({length:41},()=>f.item('wardens_blade'))];
 f.p.storage=[f.item('potion',30),f.item('wardens_blade',1,3)];
 assert.equal(f.send(command('withdraw',f.p.storage[0])).ok,true);assert.equal(f.p.inventory.length,42);assert.equal(f.p.inventory[0].count,50);assert.equal(f.p.storage[0],null);
 const sword=structuredClone(f.p.storage[1]);assert.equal(f.send(command('withdraw',sword)).reason,'bag-full');assert.deepEqual(f.p.storage[1],sword);
 assert.equal(f.send(command('deposit',f.p.inventory[1],{index:0})).ok,true);
 assert.equal(f.send(command('withdraw',sword)).ok,true);assert.ok(f.p.inventory.some(i=>i.uid===sword.uid&&i.plus===3));
});
test('invalid quantities, stale references and occupied cells never mutate either container',t=>{
 const f=fixture(t);f.p.inventory=[f.item('potion',20)];f.p.storage=[f.item('wardens_blade')];
 const before=()=>JSON.stringify([f.p.inventory,f.p.storage]),initial=before(),reference=structuredClone(f.p.inventory[0]);
 for(const quantity of [0,-1,1.5,21,NaN,Infinity,Number.MAX_SAFE_INTEGER,'3']){
  assert.equal(f.send(command('deposit',reference,{quantity})).reason,'invalid-storage-quantity');assert.equal(before(),initial);
 }
 assert.equal(f.send(command('deposit',reference,{index:0})).reason,'storage-slot-occupied');assert.equal(before(),initial);
 assert.equal(f.send(command('deposit',{...reference,count:19})).reason,'stale-item');assert.equal(before(),initial);
 assert.equal(f.send(command('deposit',reference,{index:500})).reason,'invalid-storage-slot');assert.equal(before(),initial);
});
test('failed durable write rolls back both halves, then retry succeeds once',t=>{
 const f=fixture(t);f.p.inventory=[f.item('potion',20)];const request=command('deposit',f.p.inventory[0],{quantity:4});f.w.checkpoint();
 f.store.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'qa-disk-error'); END;");
 assert.throws(()=>f.send(request,'atomic-once'),/qa-disk-error/);assert.equal(f.p.inventory[0].count,20);assert.deepEqual(f.p.storage,[]);
 assert.equal(f.store.load().characters[f.id].inventory[0].count,20);assert.deepEqual(f.store.load().characters[f.id].storage,[]);
 f.store.db.exec('DROP TRIGGER fail_receipt');assert.equal(f.send(request,'atomic-once').ok,true);f.restart();assert.equal(f.send(request,'atomic-once').ok,true);
 assert.equal(f.p.inventory[0].count,16);assert.equal(f.p.storage[0].count,4);
});
test('storage remains proximity gated and whole equipment can be reordered and returned',t=>{
 const f=fixture(t),sword=f.item('wardens_blade',1,3);f.p.inventory=[sword];f.p.x=90;f.p.z=90;
 assert.equal(f.send(command('deposit',sword)).reason,'storage-unavailable');Object.assign(f.p,SERVICES['npc:storage']);
 assert.equal(f.send(command('deposit',sword,{index:3})).ok,true);assert.equal(f.send(command('reorder',sword,{index:499})).ok,true);
 assert.equal(f.send(command('withdraw',sword,{index:0})).ok,true);assert.deepEqual(f.p.inventory,[sword]);
});
test('legacy unknown items remain withdrawable and are never merged speculatively',t=>{
 const f=fixture(t),old=f.item('legacy_unknown_item',2);f.p.storage=[old];f.p.inventory=[f.item(old.id,3)];
 assert.equal(f.send(command('withdraw',old)).ok,true);assert.equal(f.p.inventory.length,2);
 assert.equal(f.p.inventory[1].uid,old.uid);assert.equal(f.p.inventory[1].count,2);assert.equal(f.p.storage[0],null);
});
