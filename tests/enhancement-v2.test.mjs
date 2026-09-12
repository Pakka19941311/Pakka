import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCROLLS,scrollChance,enhanceItem,enhancementCategory,rollScrollDrops,migrateScrollSave} from '../src/core/enhancement-v2.ts';
import {LocalGameGateway} from '../src/network/game-gateway.ts';
const golden=JSON.parse(readFileSync(new URL('../docs/ENHANCEMENT_BALANCE_V2.json',import.meta.url))).curves;
const item=(id,plus=0,count=1,uid=id)=>({id,plus,count,uid});
const definition=i=>({slot:i.id==='weapon'?'weapon':i.id==='armor'?'chest':undefined});
function fixture(id,plus,slot='weapon') {
 const scroll=item(id,0,3),target=item(slot,plus);
 return {player:{dead:false,inventory:[scroll,target],equipment:{}},scroll:{...scroll},target:{...target,location:'bag'}};
}
for(const [id,{category,quality}] of Object.entries(SCROLLS))for(let plus=0;plus<15;plus++)test(`${id} +${plus}→+${plus+1}: exact table and RNG boundary`,()=>{
 const p=golden[`${category}_${quality}`][plus].chance_percent/100;assert.equal(scrollChance(id,category==='weapon'?'weapon':'chest',plus),p);
 const f=fixture(id,plus,category==='weapon'?'weapon':'armor'),before=structuredClone(f.player);
 const success=enhanceItem(f.player,f.scroll,f.target,definition,p===1?.999999:p-1e-12);
 assert.ok(success.ok&&success.success);assert.equal(success.inventory.find(i=>i.uid===f.target.uid).plus,plus+1);assert.equal(success.inventory.find(i=>i.id===id).count,2);assert.deepEqual(f.player,before);
 if(p<1){const fail=enhanceItem(f.player,f.scroll,f.target,definition,p);assert.ok(fail.ok&&!fail.success);assert.equal(fail.inventory.some(i=>i.uid===f.target.uid),false);assert.equal(fail.inventory.find(i=>i.id===id).count,2);}
});
test('wrong category, cap, changed refs, dead and invalid RNG never spend',()=>{
 const f=fixture('armor_scroll',3),before=structuredClone(f.player);assert.equal(enhanceItem(f.player,f.scroll,f.target,definition,0).ok,false);
 for(const mutate of [f=>f.target.plus++,f=>f.scroll.count--,f=>f.player.dead=true,f=>f.player.inventory.push({...f.player.inventory[0]})]){const f=fixture('weapon_scroll',3);mutate(f);assert.equal(enhanceItem(f.player,f.scroll,f.target,definition,0).ok,false);}
 for(const roll of [-1,1,NaN,Infinity]){const f=fixture('weapon_scroll',3);assert.equal(enhanceItem(f.player,f.scroll,f.target,definition,roll).ok,false);}
 const cap=fixture('weapon_scroll',15);assert.equal(enhanceItem(cap.player,cap.scroll,cap.target,definition,0).ok,false);assert.deepEqual(f.player,before);
});
test('equipped destruction clears exact slot and old request cannot be replayed',()=>{
 const f=fixture('weapon_scroll',3);f.player.equipment.weapon=f.player.inventory.pop();f.target.location='equipment';f.target.slot='weapon';
 const result=enhanceItem(f.player,f.scroll,f.target,definition,.9);assert.ok(result.ok);assert.equal(result.equipment.weapon,undefined);
 assert.equal(enhanceItem({...f.player,...result},f.scroll,f.target,definition,0).ok,false);
});
test('cloak and remaining nonweapon slots use armor category; all ring aliases reject scrolls',()=>{
 for(const slot of ['head','chest','boots','gloves','belt','neck','cloak','ear','offhand'])assert.equal(enhancementCategory(slot),'armor');
 assert.equal(enhancementCategory('material'),null);for(const slot of ['ring','ring1','ring2']){assert.equal(enhancementCategory(slot),null);assert.equal(scrollChance('armor_scroll_improved',slot,1),0);assert.equal(scrollChance('armor_scroll',slot,1),0);}
});
test('migration preserves progress and reserve from inventory and loot buffer exactly once',()=>{
 const old={schema:1,player:{name:'Mage',level:9,inventory:[item('scroll',0,4),item('weapon',7)]},lootBuffer:[item('scroll',0,2,'buffer')],settings:{uiScale:1.25}};
 const next=migrateScrollSave(old);assert.equal(next.legacyScrolls,6);assert.equal(next.player.level,9);assert.equal(next.player.inventory[0].plus,7);assert.deepEqual(next.settings,old.settings);assert.equal(old.player.inventory.length,2);assert.deepEqual(migrateScrollSave(next),next);
 assert.throws(()=>migrateScrollSave({...old,schema:3}));
});
test('drop lists and categorical boundaries: improved is ten times rarer, no universal source',()=>{
 for(const id of ['wolf','spider','bat','unknown'])assert.deepEqual(rollScrollDrops(id,()=>{throw Error('Must not roll');}),[]);
 assert.deepEqual(rollScrollDrops('exile',()=>.001999),['weapon_scroll_improved']);assert.deepEqual(rollScrollDrops('exile',()=>.002),['weapon_scroll']);assert.deepEqual(rollScrollDrops('exile',()=>.022),[]);
 assert.deepEqual(rollScrollDrops('big',()=>0),['weapon_scroll_improved','armor_scroll_improved']);
 const counts={};for(let i=0;i<10000;i++)for(const id of rollScrollDrops('undead',()=>i/10000))counts[id]=(counts[id]??0)+1;
 assert.deepEqual(counts,{armor_scroll_improved:20,armor_scroll:200});
});
test('storage failure cannot commit candidate and corrupt saves are retained',async()=>{
 const map=new Map([['save','{broken']]);let fail=false;
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('Quota');map.set(k,v);},removeItem:k=>map.delete(k)};
 const gateway=new LocalGameGateway('save',storage);await assert.rejects(gateway.load());assert.equal(map.get('save'),'{broken');
 map.set('save','{"schema":1}');gateway.saveNow({schema:2},true);assert.equal(map.get('save_before_scroll_v2'),'{"schema":1}');
 fail=true;assert.throws(()=>gateway.saveNow({schema:2,spent:true}));assert.equal(map.get('save'),'{"schema":2}');
});
