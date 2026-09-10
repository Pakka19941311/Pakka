import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {SERVICES} from '../src/world/territory.ts';
import {applyExperience} from '../src/core/gameplay-session.ts';
import {xpNeeded} from '../src/core/game-rules.ts';
import {MONSTERS} from '../src/data/game-data.ts';
import {teleportProgressRecovery} from '../src/core/teleport-progress-repair.ts';

function fixture(t){
 const root=resolve('.'),directory=mkdtempSync(join(root,'.teleport-qa-')),filename=join(directory,'world.sqlite');
 let serial=0,store=new WorldStore(filename),world;
 const options=()=>({store,collision:new CollisionWorld(),now:1000,xpRate:20,random:()=>.5,identifier:()=>`teleport-${++serial}`});
 world=new WorldSimulation(options());const id=world.createCharacter('Level preservation','knight').id;
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(root+sep));rmSync(directory,{recursive:true,force:true});});
 const earned=applyExperience(1,0,Array.from({length:9},(_,i)=>xpNeeded(i+1)).reduce((a,b)=>a+b,0)+16000);
 Object.assign(world.state.characters[id],earned,{gold:1000});world.recalculate(world.state.characters[id]);
 return {get w(){return world;},get p(){return world.state.characters[id];},
  place:service=>{const {x,z}=SERVICES[service];Object.assign(world.state.characters[id],{x,z});},
  send:(c,key=`teleport-command-${++serial}`)=>world.command(id,key,c),
  restart:()=>{world.checkpoint();store.close();store=new WorldStore(filename);world=new WorldSimulation(options());}};
}
const progress=p=>({id:p.id,name:p.name,classId:p.classId,level:p.level,xp:p.xp,stats:structuredClone(p.stats),maxHp:p.maxHp,maxMp:p.maxMp,inventory:structuredClone(p.inventory),equipment:structuredClone(p.equipment)});

test('real town teleports preserve earned level, XP, identity, equipment and stats, including SQLite restart',t=>{
 const f=fixture(t);assert.equal(f.p.level,10);const before=progress(f.p);
 f.place('npc:teleport');const first=f.send({type:'teleport',destination:'Астерхолд'},'asterhold-once');assert.equal(first.ok,true);
 assert.deepEqual(progress(f.p),before);assert.equal(f.p.gold,1000);assert.equal(Object.hasOwn(f.p,'cost'),false);
 assert.deepEqual(f.send({type:'teleport',destination:'Астерхолд'},'asterhold-once'),first);
 f.place('npc:asterhold:teleport');assert.equal(f.send({type:'teleport',destination:'Гринфолл'}).ok,true);
 assert.deepEqual(progress(f.p),before);assert.equal(f.p.gold,975);
 f.restart();assert.deepEqual(progress(f.p),before);
 f.place('npc:teleport');assert.equal(f.send({type:'teleport',destination:'Чёрный лес'}).ok,true);
 assert.deepEqual(progress(f.p),before);assert.equal(f.p.gold,885);
});

test('first kill after teleport awards XP from the preserved level at x20, never from level one',t=>{
 const f=fixture(t);const expected=applyExperience(f.p.level,f.p.xp,MONSTERS.wolf.xp*20);
 f.place('npc:teleport');assert.equal(f.send({type:'teleport',destination:'Астерхолд'}).ok,true);
 const target=f.w.state.monsters.find(m=>m.id==='wolf');f.w.damage(target,target.hp+1,f.p,false);
 assert.equal(f.p.level,expected.level);assert.equal(f.p.xp,expected.xp);assert.ok(f.p.level>=10);
 f.restart();assert.equal(f.p.level,expected.level);assert.equal(f.p.xp,expected.xp);
});

test('collision position queries return coordinates only and never alias gameplay metadata',()=>{
 const collision=new CollisionWorld(),point={x:10,z:10,level:1,cost:25,name:'Portal'};
 assert.deepEqual(collision.findNearestFree(point,.46),{x:10,z:10});
 assert.notEqual(collision.findNearestFree(point,.46),point);
 collision.addCircle(10,10,1);const free=collision.findNearestFree(point,.46);
 assert.deepEqual(Object.keys(free).sort(),['x','z']);assert.equal(collision.isBlocked(free,.46),false);
});

test('damaged local preview progress recovers its known level and XP already spent at the wrong thresholds',()=>{
 const prior={id:'hero',classId:'knight',level:10};
 const broken=applyExperience(1,16000,MONSTERS.wolf.xp*20);
 const hero={...prior,...broken,cost:0};
 const repair=teleportProgressRecovery(hero,prior);
 const correct=applyExperience(10,16000,MONSTERS.wolf.xp*20);
 assert.deepEqual(repair.to,{level:correct.level,xp:correct.xp});
 assert.equal(teleportProgressRecovery({...hero,cost:undefined},prior),null);
 assert.equal(teleportProgressRecovery({...hero,classId:'mage'},prior),null);
 assert.equal(teleportProgressRecovery(hero,undefined),null);
 assert.equal(teleportProgressRecovery({...hero,...repair.to,cost:undefined},prior),null);
});
