import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
import {findNavigationPath} from '../src/world/navigation.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {SKILL_BOOKS} from '../src/data/skill-books.ts';
const map=new FinalWorld(), c=map.spaces.surface.collision;
const tavern=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard.json','utf8')).tavern;
class Store{state=null;receipts=new Map();load(){return this.state&&structuredClone(this.state);}save(s){this.state=structuredClone(s);}receipt(p,id){return this.receipts.get(p+id);}commit(s,p,id,c,r){this.save(s);this.receipts.set(p+id,r);}}
function fixture(){let seq=0;const store=new Store(),opts={store,now:1000,finalWorld:map,collision:c,identifier:()=>'inn-'+(++seq)};
 const w=new WorldSimulation(opts),p=w.createCharacter('Таверна','knight');p.gold=250000;return {w,p,store,opts};}
function route(a,b){
 assert.equal(c.isBlocked(a,.46),false,JSON.stringify(a));assert.equal(c.isBlocked(b,.46),false,JSON.stringify(b));
 const path=findNavigationPath(c,a,b,{actorRadius:.46,cellSize:.5,margin:20,maxVisited:14000});assert.ok(path.length,'route unreachable');
 let prev=a;for(const p of path){const n=Math.ceil(Math.hypot(p.x-prev.x,p.z-prev.z)/.15);for(let i=1;i<=n;i++)assert.equal(c.isBlocked({x:prev.x+(p.x-prev.x)*i/n,z:prev.z+(p.z-prev.z)*i/n},.46),false);prev=p;}
}
test('tavern doorway is physically open and both bar and books connect to the main court',()=>{
 const seller=map.services['npc:books'];
 route({x:-100,z:-205},tavern.entry);route(tavern.entry,tavern.inside);route(tavern.inside,{x:seller.x,z:-192.8});route(tavern.inside,{x:-158,z:-194});route(tavern.inside,tavern.entry);
 for(let x=-145;x<=-140;x+=.15)assert.equal(c.isBlocked({x,z:-199},.46),false,'invisible doorway wall');
 assert.equal(c.isBlocked({x:-142.5,z:-206},.46),true,'solid tavern wall');
 assert.equal(c.isBlocked({x:-158,z:-191.7},.46),true,'bar counter remains solid');
});
test('bookshop uses the existing catalogue, charges once, and survives existing-save reload',()=>{
 const {w,p,store,opts}=fixture();w.relocate(p,{x:-146.4,z:-192.8,spaceId:'surface'});
 const amount=p.gold, id='book_knight_10';
 assert.equal(w.command(p.id,'buy-inn-001',{type:'buy',itemId:id}).ok,true);
 assert.equal(w.state.characters[p.id].gold,amount-SKILL_BOOKS[id].price);
 assert.equal(w.command(p.id,'buy-inn-001',{type:'buy',itemId:id}).ok,true);
 assert.equal(w.state.characters[p.id].inventory.filter(i=>i.id===id).length,1);
 assert.equal(w.state.characters[p.id].gold,amount-SKILL_BOOKS[id].price);
 w.checkpoint();const reload=new WorldSimulation({...opts,now:4000});
 assert.ok(reload.finalWorld.services['npc:books']);assert.equal(reload.state.characters[p.id].inventory.filter(i=>i.id===id).length,1);
});
test('no book sales through tavern walls, from another space, or of class/quest-only books',()=>{
 const {w,p}=fixture();
 const buy=(id,key)=>w.command(p.id,'tavern-'+key,{type:'buy',itemId:id});
 w.relocate(p,{x:-140.8,z:-189.9,spaceId:'surface'});assert.equal(buy('book_knight_10','far').reason,'shop-unavailable');
 let live=w.state.characters[p.id];w.relocate(live,{x:-146.4,z:-192.8,spaceId:'surface'});
 const visible=w.lineOfSight;w.lineOfSight=()=>false;assert.equal(buy('book_knight_10','wall').reason,'shop-unavailable');w.lineOfSight=visible;
 assert.equal(buy('book_mage_10','class').reason,'class-restricted');assert.equal(buy('book_knight_60','quest').reason,'shop-unavailable');
 live=w.state.characters[p.id];w.relocate(live,{x:0,z:-4,spaceId:'great_cave'});assert.equal(buy('book_knight_10','space').reason,'shop-unavailable');
});
test('the established Asterhold bookseller still sells at his actual final-map anchor',()=>{
 const {w,p}=fixture(),seller=map.services['npc:asterhold:shop'];w.relocate(p,{...seller,x:seller.x+1});
 assert.equal(w.command(p.id,'asterhold',{type:'buy',itemId:'book_knight_10'}).ok,true);
});
