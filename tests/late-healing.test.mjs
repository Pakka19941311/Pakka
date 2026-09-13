import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './stage-commerce.test.mjs';
import {SERVICES} from '../src/world/territory.ts';
import {LATE_HEALING_POTIONS} from '../src/data/healing-potions-v3.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
for(const [itemId,definition] of Object.entries(LATE_HEALING_POTIONS)){
 test(itemId+': vendors, level, exact healing, no waste, stale retry and reload',()=>{
  const {world:w,id,hero,store}=fixture();let command=0;
  const buy=()=>w.command(id,'late-buy-'+(++command),{type:'buy',itemId});
  Object.assign(hero(),SERVICES['npc:shop']);hero().gold=20000;hero().level=definition.requiredLevel-1;
  assert.equal(buy().reason,'level-required');assert.equal(hero().gold,20000);
  hero().inventory.push(w.item(itemId));hero().hp-=200;
  const use=()=>w.command(id,'late-use-'+(++command),{type:'use',item:structuredClone(hero().inventory.find(i=>i.id===itemId))});
  assert.equal(use().reason,'level-required');assert.equal(hero().inventory.find(i=>i.id===itemId).count,1);
  hero().level=definition.requiredLevel;w.recalculate(hero());
  assert.ok(buy().ok);assert.equal(hero().gold,20000-definition.buyPrice);
  Object.assign(hero(),SERVICES['npc:alchemist']);assert.ok(buy().ok);assert.equal(hero().gold,20000-2*definition.buyPrice);
  hero().hp=hero().maxHp-definition.heal-10;hero().target='kept-target';hero().direction={x:0,z:1};const hp=hero().hp;
  const reference=structuredClone(hero().inventory.find(i=>i.id===itemId)),payload={type:'use',item:reference};
  assert.ok(w.command(id,'late-heal-retry',payload).ok);assert.equal(hero().hp,hp+definition.heal);
  assert.ok(w.command(id,'late-heal-retry',payload).ok);assert.equal(hero().hp,hp+definition.heal);
  assert.equal(w.command(id,'late-heal-stale',payload).reason,'stale-item');assert.equal(hero().target,'kept-target');assert.deepEqual(hero().direction,{x:0,z:1});
  hero().hp=hero().maxHp-5;assert.ok(use().ok);assert.equal(hero().hp,hero().maxHp);
  assert.equal(use().reason,'health-full');assert.equal(hero().inventory.find(i=>i.id===itemId).count,1);
  hero().dead=true;assert.equal(use().reason,'dead');hero().dead=false;
  w.checkpoint();const restored=new WorldSimulation({store,now:w.state.time,collision:new CollisionWorld(),beta:false});
  assert.equal(restored.state.characters[id].inventory.find(i=>i.id===itemId).count,1);
  assert.equal(restored.state.characters[id].gold,hero().gold);
 });
}
test('late bottle purchase outside a vendor or into a full bag never charges gold',()=>{
 const {world:w,id,hero}=fixture();hero().level=90;hero().gold=10000;
 hero().x=500;hero().z=500;assert.equal(w.command(id,'late-remote-buy',{type:'buy',itemId:'v3_potion_supreme'}).reason,'shop-unavailable');
 Object.assign(hero(),SERVICES['npc:shop']);hero().inventory=Array.from({length:42},()=>w.item('potion'));
 assert.equal(w.command(id,'late-full-buy',{type:'buy',itemId:'v3_potion_supreme'}).reason,'bag-full');assert.equal(hero().gold,10000);
});
