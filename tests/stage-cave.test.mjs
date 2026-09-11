import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CAVE_BOSS_ID,CAVE_BOSS_UID,CAVE_BOSS_RESPAWN_MS} from '../src/data/cave-boss.ts';
import {MONSTERS} from '../src/data/game-data.ts';
import {rollLootV3} from '../src/data/loot-v3.ts';
const map=new FinalWorld();
class Store{state=null;receipts=new Map();load(){return this.state&&structuredClone(this.state);}save(s){this.state=structuredClone(s);}receipt(p,id){return this.receipts.get(p+id);}commit(s,p,id,c,r){this.save(s);this.receipts.set(p+id,r);}}
function fixture(){
 const store=new Store();let serial=0;
 const options={store,now:1000,finalWorld:map,collision:map.spaces.surface.collision,identifier:()=>'cave-'+(++serial),random:()=>.4};
 const w=new WorldSimulation(options),p=w.createCharacter('Пещера','knight');
 p.level=40;w.recalculate(p);p.hp=p.maxHp;
 return {w,p,store,options,boss:()=>w.state.monsters.find(m=>m.uid===CAVE_BOSS_UID)};
}
function advance(w,ms){w.advance(w.state.time+ms);}
function command(w,p,c){return w.command(p.id,'stage-cave-'+w.state.revision+'-'+w.state.time,c);}
test('cave adds one authored boss without replacing the 1000 existing slots',()=>{
 const base=JSON.parse(readFileSync('godot-pc/world-final/gameplay/spawn-manifest.json','utf8')).slots;
 assert.deepEqual(map.slots.slice(0,1000),base);assert.equal(map.slots.length,1001);
 const {w,boss}=fixture();assert.equal(w.state.monsters.filter(m=>m.uid===CAVE_BOSS_UID).length,1);
 assert.equal(w.state.monsters.filter(m=>m.spaceId==='great_cave'&&m.id!==CAVE_BOSS_ID).length,110);
 assert.equal(MONSTERS.cave_boss.level,40);assert.equal(w.monsterRange(boss()),13);
 assert.equal(map.spaces.great_cave.collision.isBlocked(boss(),1.65),false);
});
test('portal requires proximity, ground and line of sight; safe arrivals clear movement and allow exit',()=>{
 const {w,p,boss}=fixture();
 w.relocate(p,{x:245,z:272,spaceId:'surface'});
 assert.equal(command(w,p,{type:'portal',destination:'great_cave'}).reason,'portal-out-of-range');
 const live=w.state.characters[p.id];w.relocate(live,{x:245,z:278,spaceId:'surface'});
 live.direction={x:0,z:1};live.destination={x:245,z:290};
 assert.equal(command(w,live,{type:'portal',destination:'great_cave'}).ok,true);
 assert.equal(live.spaceId,'great_cave');assert.deepEqual(live.direction,{x:0,z:0});assert.equal(live.destination,null);
 assert.ok(Math.hypot(live.x-boss().x,live.z-boss().z)>70);
 assert.equal(command(w,live,{type:'portal',destination:'great_cave'}).reason,'portal-out-of-range');
 const inside=w.state.characters[p.id];w.relocate(inside,{x:0,z:-6,spaceId:'great_cave'});
 assert.equal(command(w,inside,{type:'portal',destination:'great_cave'}).ok,true);
 assert.equal(inside.spaceId,'surface');assert.equal(inside.yaw,Math.PI);
 assert.equal(map.spaces.surface.collision.isBlocked(inside,.46),false);
 assert.equal(w.state.monsters.filter(m=>m.uid===CAVE_BOSS_UID).length,1);
 const peer=w.state.characters[p.id];w.relocate(peer,{x:245,z:278,spaceId:'surface'});
 const actual=w.lineOfSight;w.lineOfSight=()=>false;
 assert.equal(command(w,peer,{type:'portal',destination:'great_cave'}).reason,'portal-out-of-range');w.lineOfSight=actual;
});
test('boss ranged telegraph damages nearby heroes, respects walls and returns when player leaves',()=>{
 const {w,p,boss}=fixture(),b=boss();
 for(const m of w.state.monsters)if(m!==b){m.alive=false;m.respawnAt=Infinity;}
 w.relocate(p,{x:b.x+10,z:b.z,spaceId:'great_cave'});p.activeUntil=1e9;
 const q=w.createCharacter('Союзник','ranger');q.level=40;w.recalculate(q);q.hp=q.maxHp;w.relocate(q,{x:p.x+1,z:p.z+1,spaceId:'great_cave'});q.activeUntil=1e9;
 const hp=[p.hp,q.hp];w.damage(b,1,p,false);advance(w,600);
 const pending=w.state.pending.find(a=>a.actor===b.uid);assert.ok(pending?.slam);assert.ok(Math.hypot(pending.slam.x-b.x,pending.slam.z-b.z)>8);
 assert.ok(w.snapshot(p.id).groundEffects.some(e=>e.id.includes(b.uid)));
 advance(w,1600);assert.ok(p.hp<hp[0]);assert.ok(q.hp<hp[1]);
 const before=p.hp;const visible=w.lineOfSight;w.lineOfSight=()=>false;advance(w,4000);assert.equal(p.hp,before);w.lineOfSight=visible;
 w.relocate(p,{x:245,z:272,spaceId:'surface'});w.relocate(q,{x:245,z:272,spaceId:'surface'});
 advance(w,18000);assert.equal(b.spaceId,'great_cave');assert.ok(Math.hypot(b.x-b.home.x,b.z-b.home.z)<.7);assert.equal(b.targetId,null);assert.equal(b.hp,MONSTERS.cave_boss.hp);
});
test('boss death pays once; cave reentry/reload keep remaining game-time respawn',()=>{
 const {w,p,boss,store,options}=fixture(),b=boss();
 w.relocate(p,{x:b.x+5,z:b.z,spaceId:'great_cave'});
 const gold=p.gold;w.damage(b,1e9,p,false);assert.equal(p.gold,gold+100000);
 const inventory=JSON.stringify(p.inventory);w.damage(b,1e9,p,false);assert.equal(p.gold,gold+100000);assert.equal(JSON.stringify(p.inventory),inventory);
 assert.equal(w.events.filter(e=>e.kind==='loot'&&e.target===b.uid).length,1);
 assert.equal(b.respawnAt-b.deathAt,CAVE_BOSS_RESPAWN_MS);
 w.relocate(p,{x:0,z:-6,spaceId:'great_cave'});assert.equal(command(w,p,{type:'portal',destination:'great_cave'}).ok,true);
 w.relocate(p,{x:245,z:278,spaceId:'surface'});assert.equal(command(w,p,{type:'portal',destination:'great_cave'}).ok,true);assert.equal(b.alive,false);
 w.relocate(p,{x:245,z:272,spaceId:'surface'});p.activeUntil=0;advance(w,600000);w.checkpoint();
 const remaining=b.respawnAt-w.state.time,closed=7*86400000;
 const restored=new WorldSimulation({...options,now:w.state.time+closed}),rb=restored.state.monsters.find(m=>m.uid===b.uid);
 assert.equal(restored.state.monsters.filter(m=>m.uid===b.uid).length,1);assert.equal(rb.alive,false);assert.equal(rb.respawnAt-restored.state.time,remaining);
 for(const h of Object.values(restored.state.characters))h.activeUntil=0;
 restored.advance(rb.respawnAt-1);assert.equal(rb.alive,false);
 restored.advance(rb.respawnAt+20);assert.equal(rb.alive,true);assert.equal(rb.generation,b.generation+1);
});
test('loot gives 3 normal + 3 improved scrolls, one weapon and 20% at most one random class book',()=>{
 let state=73219;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
 let books=0;const classes=new Set(),weapons=new Set();
 for(let kill=0;kill<10000;kill++){
  const drops=rollLootV3(CAVE_BOSS_ID,random);
  assert.equal(drops.filter(d=>['weapon_scroll','armor_scroll'].includes(d.id)).reduce((n,d)=>n+d.count,0),3);
  assert.equal(drops.filter(d=>d.id.endsWith('_scroll_improved')).reduce((n,d)=>n+d.count,0),3);
  const weapon=drops.filter(d=>d.id.startsWith('warden_'));assert.equal(weapon.length,1);assert.equal(weapon[0].count,1);weapons.add(weapon[0].id);
  const book=drops.filter(d=>d.id.startsWith('book_'));assert.ok(book.length<=1);
  if(book.length){books++;assert.equal(book[0].count,1);assert.ok(Number(book[0].id.split('_')[2])>=60);classes.add(book[0].id.split('_')[1]);}
 }
 assert.ok(books>1850&&books<2150);assert.equal(classes.size,5);assert.equal(weapons.size,5);
});
