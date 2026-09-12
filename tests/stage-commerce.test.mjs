import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {ITEMS} from '../src/data/game-data.ts';
import {SERVICES} from '../src/world/territory.ts';
class MemoryStore {
 state=null; receipts=new Map(); fail=false;
 load(){return this.state?structuredClone(this.state):null;}
 save(s){this.state=structuredClone(s);}
 receipt(p,id){return this.receipts.get(p+id);}
 commit(s,p,id,c,r){if(this.fail)throw Error('disk failure');this.save(s);this.receipts.set(p+id,r);}
}
export function fixture(){
 let serial=0;const store=new MemoryStore();
 const world=new WorldSimulation({store,now:1000,identifier:()=>`commerce-${++serial}`,random:()=>.5,collision:new CollisionWorld(),beta:false});
 const p=world.createCharacter('Торговля','knight'),id=p.id;
 world.heartbeat(id);
 p.inventory=[{uid:'sale-stack',id:'potion',plus:0,count:10}];
 return {world,store,id,hero:()=>world.state.characters[id],ref:()=>structuredClone(world.state.characters[id].inventory[0])};
}
test('sell 3 of 10, then all; receipt retry and stale second confirmation cannot pay twice',()=>{
 const {world:w,id,hero,ref}=fixture();const before=hero().gold,item=ref(),price=Math.floor(ITEMS.potion.value*.48);
 Object.assign(hero(),{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});
 const trade=w.command(id,'open-sale-0001',{type:'tradeOpen',npcId:'npc:smith'}).outcome;
 const command={type:'sell',item,quantity:3,trade};
 assert.equal(w.command(id,'partial-sale-01',command).ok,true);
 assert.equal(hero().inventory[0].count,7);assert.equal(hero().gold,before+3*price);
 assert.equal(w.command(id,'partial-sale-01',command).ok,true);
 assert.equal(w.command(id,'partial-sale-02',command).reason,'stale-item');
 assert.equal(hero().inventory[0].count,7);assert.equal(hero().gold,before+3*price);
 assert.equal(w.command(id,'sell-remaining',{type:'sell',item:ref(),quantity:7,trade}).ok,true);
 assert.equal(hero().inventory.length,0);assert.equal(hero().gold,before+10*price);
});
test('invalid quantity and changed/moved items cannot mutate either inventory or currency',()=>{
 const {world:w,id,hero,ref}=fixture();
 Object.assign(hero(),{x:SERVICES['npc:alchemist'].x,z:SERVICES['npc:alchemist'].z});
 const trade=w.command(id,'open-sale-0001',{type:'tradeOpen',npcId:'npc:alchemist'}).outcome;
 for(const [index,quantity] of [0,-1,1.5,'3','abc',11,NaN,Infinity].entries()){
  const before=structuredClone({inventory:hero().inventory,gold:hero().gold});
  assert.equal(w.command(id,'invalid-quantity-'+index,{type:'sell',item:ref(),quantity,trade}).reason,'invalid-quantity');
  assert.deepEqual({inventory:hero().inventory,gold:hero().gold},before);
 }
 const old=ref();hero().inventory[0].count=9;
 assert.equal(w.command(id,'changed-stack-01',{type:'sell',item:old,quantity:1,trade}).reason,'stale-item');
 const moved=ref();hero().storage=[moved];hero().inventory=[];
 assert.equal(w.command(id,'moved-stack-0001',{type:'sell',item:moved,quantity:1,trade}).reason,'stale-item');
 assert.equal(hero().storage[0].count,9);
});
test('failed persistence rolls both sides of the sale back',()=>{
 const {world:w,store,id,hero,ref}=fixture();
 Object.assign(hero(),{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});
 const trade=w.command(id,'open-sale-0001',{type:'tradeOpen',npcId:'npc:smith'}).outcome;
 const before=structuredClone(hero());store.fail=true;
 assert.throws(()=>w.command(id,'failed-commit-01',{type:'sell',item:ref(),quantity:3,trade}),/disk failure/);
 assert.deepEqual(hero(),before);
});
