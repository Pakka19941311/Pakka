import test from 'node:test';
import assert from 'node:assert/strict';
import {grantBetaScrolls, BETA_SCROLL_GRANT} from '../src/core/beta-scrolls.ts';
import {SCROLLS} from '../src/core/enhancement-v2.ts';
import {LocalGameGateway} from '../src/network/game-gateway.ts';
const item = (id, count=1, uid=id) => ({id, count, uid, plus:0});
test('beta issues exactly four 100 stacks; spending and reload never replenish them', () => {
 const original={player:{inventory:[item('potion',6)],level:7},quest:3};
 const next=grantBetaScrolls(original,item);
 assert.equal(original.player.inventory.length,1);assert.equal(next.player.level,7);assert.equal(next.quest,3);
 for(const id of Object.keys(SCROLLS))assert.equal(next.player.inventory.find(i=>i.id===id).count,100);
 assert.equal(next.betaScrollGrant,BETA_SCROLL_GRANT);
 next.player.inventory.find(i=>i.id==='weapon_scroll').count=99;
 const loaded=JSON.parse(JSON.stringify(next));assert.equal(grantBetaScrolls(loaded,item),loaded);
 assert.equal(loaded.player.inventory.find(i=>i.id==='weapon_scroll').count,99);
});
test('existing stock is preserved, full bag buffers missing types, receipt covers the whole grant', () => {
 const inventory=Array.from({length:42},(_,i)=>item('iron',1,String(i)));
 inventory[0]=item('weapon_scroll',8,'old');
 const original={player:{inventory},lootBuffer:[item('armor_scroll',3,'buffer')],legacyScrolls:7};
 const next=grantBetaScrolls(original,item);
 assert.equal(next.player.inventory.length,42);assert.equal(next.player.inventory[0].uid,'old');assert.equal(next.player.inventory[0].count,108);
 assert.equal(next.lootBuffer.find(i=>i.id==='armor_scroll').count,103);assert.equal(next.lootBuffer.length,3);assert.equal(next.legacyScrolls,7);
 assert.deepEqual(next.player.inventory.slice(1),inventory.slice(1));assert.equal(grantBetaScrolls(next,item),next);
});
test('failed grant persistence retains old save; retry grants once; invalid stock never mutates', async () => {
 const old={player:{inventory:[item('weapon_scroll',2)]}};let raw=JSON.stringify(old),fail=true;
 const gateway=new LocalGameGateway('save',{getItem:()=>raw,setItem:(_k,v)=>{if(fail)throw Error('Quota');raw=v;},removeItem:()=>{}});
 const next=grantBetaScrolls(old,item);assert.throws(()=>gateway.saveNow(next));assert.deepEqual(JSON.parse(raw),old);
 fail=false;gateway.saveNow(grantBetaScrolls(await gateway.load(),item));
 const loaded=await gateway.load();assert.equal(grantBetaScrolls(loaded,item),loaded);assert.equal(loaded.player.inventory[0].count,102);
 const invalid={player:{inventory:[item('weapon_scroll',Number.MAX_SAFE_INTEGER)]}};
 assert.throws(()=>grantBetaScrolls(invalid,item));assert.equal(invalid.player.inventory[0].count,Number.MAX_SAFE_INTEGER);
});
