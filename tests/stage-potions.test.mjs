import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './stage-commerce.test.mjs';
import {SERVICES} from '../src/world/territory.ts';
import {HASTE_DURATION_MS} from '../src/world/world-cycle.ts';
test('fixed healing, cap, full HP and death consume exactly the successful doses',()=>{
 const {world:w,id,hero}=fixture();hero().inventory.push(w.item('potion_large',3));
 const use=(itemId,key)=>w.command(id,key,{type:'use',item:structuredClone(hero().inventory.find(i=>i.id===itemId))});
 hero().hp=hero().maxHp-200;let hp=hero().hp;hero().target='retained';hero().direction={x:1,z:0};
 assert.equal(use('potion','ordinary-heal-1').ok,true);assert.equal(hero().hp,hp+37);assert.equal(hero().inventory[0].count,9);
 assert.equal(hero().target,'retained');assert.deepEqual(hero().direction,{x:1,z:0});hp=hero().hp;
 assert.equal(use('potion_large','large-heal-0001').ok,true);assert.equal(hero().hp,hp+70);
 hero().hp=hero().maxHp-5;assert.equal(use('potion_large','capped-heal-01').ok,true);assert.equal(hero().hp,hero().maxHp);
 assert.equal(use('potion_large','full-health-01').reason,'health-full');assert.equal(hero().inventory.find(i=>i.id==='potion_large').count,1);
 hero().dead=true;assert.equal(use('potion','dead-no-heal-01').reason,'dead');assert.equal(hero().inventory[0].count,9);
});
test('Elza sells large healing and existing haste, alchemist retains haste, full bag does not charge',()=>{
 const {world:w,id,hero}=fixture();Object.assign(hero(),SERVICES['npc:shop']);hero().gold=500;
 assert.equal(w.command(id,'buy-large-0001',{type:'buy',itemId:'potion_large'}).ok,true);assert.equal(hero().gold,390);
 assert.equal(w.command(id,'buy-haste-0001',{type:'buy',itemId:'haste'}).ok,true);assert.equal(hero().gold,290);
 Object.assign(hero(),SERVICES['npc:alchemist']);assert.equal(w.command(id,'buy-haste-0002',{type:'buy',itemId:'haste'}).ok,true);
 hero().inventory=Array.from({length:42},()=>w.item('potion'));Object.assign(hero(),SERVICES['npc:shop']);
 const before=hero().gold;assert.equal(w.command(id,'full-bag-purchase',{type:'buy',itemId:'potion_large'}).reason,'bag-full');assert.equal(hero().gold,before);
});
test('haste refreshes one effect and expires without removing equipment speed',()=>{
 const {world:w,id,hero}=fixture();hero().inventory.push(w.item('haste',3));w.recalculate(hero());const speed=hero().stats.speed;
 const use=key=>w.command(id,key,{type:'use',item:structuredClone(hero().inventory.find(i=>i.id==='haste'))});
 assert.equal(use('speed-first-0001').ok,true);assert.equal(hero().stats.speed,speed*1.5);
 w.state.time+=1000;assert.equal(use('speed-refresh-01').ok,true);assert.equal(hero().stats.speed,speed*1.5);assert.equal(hero().buffs.haste,w.state.time+HASTE_DURATION_MS);
 w.state.time=hero().buffs.haste;w.recalculate(hero());assert.equal(hero().stats.speed,speed);
 w.checkpoint();const state=w.store.load();assert.equal(state.characters[id].buffs.haste,hero().buffs.haste);
});
