import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_LEVEL,statsAtLevel,classCombatProfile,baseVitals,accuracyForDamage,attackDamageType,manaRegenerationPerSecond,xpNeeded} from '../src/core/game-rules.ts';
import {calculateEquipmentStats,itemStatContribution} from '../src/core/equipment-stats.ts';
import {applyExperience} from '../src/core/gameplay-session.ts';
import {CLASSES,ITEMS} from '../src/data/game-data.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const zero={str:0,dex:0,int:0,vit:0,spi:0};
const keys=['str','dex','int'];
test('primary growth lands on levels 3/4/5/15/90, while level 2 and legacy VIT/SPI stay exact',()=>{
 const levels=[2,3,4,5,15,90];
 const expected={
  knight:[[0,0,0],[1,0,0],[1,0,0],[1,1,1],[5,3,3],[30,18,18]],
  mage:[[0,0,0],[1,0,1],[1,0,1],[1,1,1],[5,3,5],[30,18,30]],
  ranger:[[0,0,0],[0,1,0],[1,1,1],[1,1,1],[3,5,3],[22,30,22]],
  necro:[[0,0,0],[0,1,0],[1,1,1],[1,1,1],[3,5,3],[22,30,22]],
  assassin:[[0,0,0],[1,1,0],[1,1,0],[1,1,0],[5,5,0],[30,30,0]],
 };
 const vitalRates={knight:[.24,.05],mage:[.08,.24],ranger:[.11,.1],necro:[.11,.23],assassin:[.12,.07]};
 for(const [id,rows] of Object.entries(expected)){
  const base=CLASSES[id].stats;assert.deepEqual(statsAtLevel(id,base,1),base);
  levels.forEach((level,index)=>{
   const result=statsAtLevel(id,base,level);
   assert.deepEqual(keys.map(k=>result[k]-base[k]),rows[index],`${id} level ${level}`);
   ['vit','spi'].forEach((key,i)=>assert.equal(result[key],Math.round((base[key]+vitalRates[id][i]*(level-1))*100)/100));
  });
 }
});

test('90 is the progression cap and out-of-range stat requests cannot grow beyond it',()=>{
 assert.equal(MAX_LEVEL,90);const result=applyExperience(89,0,1e15);
 assert.equal(result.level,90);assert.equal(result.levelsGained,1);assert.equal(result.xp,xpNeeded(90)-1);
 assert.equal(applyExperience(90,0,1e15).level,90);
 for(const [id,c] of Object.entries(CLASSES))assert.deepEqual(statsAtLevel(id,c.stats,91),statsAtLevel(id,c.stats,90));
});

test('three complete STR/DEX grant exactly one physical damage and matching accuracy, without cross weights or level accuracy',()=>{
 for(const id of Object.keys(CLASSES)){
  const primary=['ranger','necro'].includes(id)?'dex':'str',other=primary==='str'?'dex':'str';
  const base=classCombatProfile(id,1,zero),two=classCombatProfile(id,1,{...zero,[primary]:2}),three=classCombatProfile(id,1,{...zero,[primary]:3});
  assert.equal(two.physicalScaling,0,id);assert.equal(two.physicalAccuracy,base.physicalAccuracy,id);
  assert.equal(three.physicalScaling,1,id);assert.equal(three.physicalAccuracy,base.physicalAccuracy+1,id);
  const unrelated=classCombatProfile(id,90,{...zero,[other]:90,int:90,spi:90});
  assert.equal(unrelated.physicalScaling,0,id);assert.equal(unrelated.physicalAccuracy,base.physicalAccuracy,id);
  const same=classCombatProfile(id,90,{...zero,[primary]:3});assert.equal(same.physicalAccuracy,three.physicalAccuracy,id);
 }
});

test('INT magical damage/accuracy use only complete triples and keep separate default-mode aliases',()=>{
 for(const id of Object.keys(CLASSES)){
  const base=classCombatProfile(id,1,zero),two=classCombatProfile(id,1,{...zero,int:2}),three=classCombatProfile(id,1,{...zero,int:3});
  assert.equal(two.magicScaling,0);assert.equal(two.magicAccuracy,base.magicAccuracy);
  assert.equal(three.magicScaling,1);assert.equal(three.magicAccuracy,base.magicAccuracy+1);
  const cross=classCombatProfile(id,90,{...zero,str:90,dex:90,vit:90,spi:90});
  assert.equal(cross.magicScaling,0);assert.equal(cross.magicAccuracy,base.magicAccuracy);
  assert.equal(three.accuracy,id==='mage'?three.magicAccuracy:three.physicalAccuracy);
 }
 assert.equal(accuracyForDamage({accuracy:81},'physical'),81);assert.equal(accuracyForDamage({accuracy:81},'magic'),81);
 assert.equal(attackDamageType('necro'),'physical');assert.equal(attackDamageType('necro',true),'magic');
});

test('two small rings cross a combined threshold and their common item accuracy enters each channel only once',()=>{
 const definitions={a:{slot:'ring',str:1,dex:1,int:1,accuracy:2},b:{slot:'ring',str:1,dex:1,int:1,accuracy:3}};
 const base={str:1,dex:1,int:1,vit:10,spi:10};
 for(const id of Object.keys(CLASSES)){
  const calculate=equipment=>calculateEquipmentStats(id,base,1,equipment,i=>definitions[i.id]);
  const empty=calculate({}),one=calculate({ring1:{id:'a',plus:0}}),two=calculate({ring1:{id:'a',plus:0},ring2:{id:'b',plus:0}});
  assert.equal(one.stats.atkMin,empty.stats.atkMin);assert.equal(one.stats.matk,empty.stats.matk);
  assert.equal(two.stats.atkMin,empty.stats.atkMin+1);assert.equal(two.stats.atkMax,empty.stats.atkMax+1);assert.equal(two.stats.matk,empty.stats.matk+1);
  assert.equal(two.stats.physicalAccuracy,empty.stats.physicalAccuracy+6);assert.equal(two.stats.magicAccuracy,empty.stats.magicAccuracy+6);
  assert.equal(itemStatContribution(definitions.a,15).atkMin,0);assert.equal(itemStatContribution(definitions.a,15).matk,0);
 }
});

test('ranger cadence keeps its curve up to a ten-percent speed bonus; assassin DEX evasion is unchanged',()=>{
 const low=classCombatProfile('ranger',1,{...zero,dex:20});close(low.attackInterval,1.02/(1+(20/200)*.45));
 const capped=classCombatProfile('ranger',1,{...zero,dex:1000});close(capped.attackInterval,1.02/1.1);
 const ordinary=classCombatProfile('mage',1,{...zero,dex:1000});close(ordinary.attackInterval,1.5/1.22);
 const a=calculateEquipmentStats('assassin',zero,1,{},()=>({}));
 const b=calculateEquipmentStats('assassin',{...zero,dex:10},1,{},()=>({}));close(b.stats.evasion-a.stats.evasion,4.5);
});

class Store {
 state=null;receipts=new Map();load(){return this.state?structuredClone(this.state):null;}
 save(state){this.state=structuredClone(state);}receipt(id,key){return this.receipts.get(id+key);}
 commit(state,id,key,payload,receipt){this.save(state);this.receipts.set(id+key,receipt);}
}
function fixture(classId='knight',random=()=>.5){
 let serial=0;const store=new Store(),world=new WorldSimulation({store,collision:new CollisionWorld(),now:1000,identifier:()=>`attribute-${++serial}`,random});
 const id=world.createCharacter('Характеристики',classId).id;world.heartbeat(id);
 const hero=()=>world.state.characters[id];Object.assign(hero(),{x:50,z:50,level:60,equipment:{},inventory:[]});world.recalculate(hero());hero().hp=hero().maxHp;hero().mp=hero().maxMp;
 const monster=world.state.monsters.find(m=>m.id==='wolf');Object.assign(monster,{x:52,z:50,home:{x:52,z:50},hp:1e6,attackReadyAt:1e9});monster.status.stun=1e9;world.state.monsters=[monster];
 const command=c=>world.command(id,`attribute-command-${++serial}`,c);
 return {world,id,hero,monster,command};
}

test('Knight STR gear changes maximum HP without healing; unequip clamps HP and repeated recalculation leaves no residue',()=>{
 const f=fixture(),p=f.hero(),original=calculateEquipmentStats('knight',CLASSES.knight.stats,p.level,{},i=>ITEMS[i.id]);
 const ring={uid:'strength-test-ring',id:'ember_ring',plus:0,count:1,legacyRingBonus:{str:3}};p.inventory.push(ring);p.hp=100;
 assert.equal(f.command({type:'equip',item:structuredClone(ring),slot:'ring1'}).ok,true);
 const contribution=itemStatContribution(ITEMS.ember_ring,0,ring.legacyRingBonus);
 assert.equal(f.hero().maxHp,original.maxHp+contribution.str*10+contribution.hp);assert.equal(f.hero().hp,100);
 f.world.recalculate(f.hero());assert.equal(f.hero().hp,100);
 f.hero().hp=f.hero().maxHp;
 assert.equal(f.command({type:'unequip',item:structuredClone(ring),slot:'ring1'}).ok,true);
 assert.equal(f.hero().maxHp,original.maxHp);assert.equal(f.hero().hp,original.maxHp);
 f.hero().hp=0;f.hero().dead=true;f.world.recalculate(f.hero());assert.equal(f.hero().hp,0);
 assert.deepEqual(f.hero().stats,original.stats);
});

test('server mana regeneration adds 0.1 INT only for Mage/Necro, refreshes after unequip and does not refill on recalculation',()=>{
 for(const id of Object.keys(CLASSES)){
  const f=fixture(id),p=f.hero();p.mp=0;
  const expected=manaRegenerationPerSecond(id,p.maxMp,p.stats);close(expected,p.maxMp*.022+(['mage','necro'].includes(id)?p.stats.int*.1:0));
  close(f.world.snapshot(f.id).character.stats.manaRegen,expected);
  f.world.advance(2000);close(f.hero().mp,expected);
 }
 for(const id of ['mage','necro']){
  const f=fixture(id),p=f.hero(),baseRate=manaRegenerationPerSecond(id,p.maxMp,p.stats);
  const ring={uid:'int-test-ring',id:'ember_ring',plus:0,count:1,legacyRingBonus:{int:3}};p.inventory.push(ring);p.mp=12;
  assert.equal(f.command({type:'equip',item:structuredClone(ring),slot:'ring1'}).ok,true);assert.equal(f.hero().mp,12);
  const contribution=itemStatContribution(ITEMS.ember_ring,0,ring.legacyRingBonus);
  close(manaRegenerationPerSecond(id,f.hero().maxMp,f.hero().stats)-baseRate,contribution.int*.1+contribution.mp*.022);
  assert.equal(f.command({type:'unequip',item:structuredClone(ring),slot:'ring1'}).ok,true);
  close(manaRegenerationPerSecond(id,f.hero().maxMp,f.hero().stats),baseRate);assert.equal(f.hero().mp,12);
  f.hero().mp=f.hero().maxMp-.01;f.world.advance(2000);assert.equal(f.hero().mp,f.hero().maxMp);
 }
});

test('Necro ordinary projectile takes physical damage/accuracy while its book takes magical damage/accuracy',()=>{
 for(const physicalHit of [true,false]){
  const f=fixture('necro',()=>.005),p=f.hero(),m=f.monster;
  Object.assign(p.stats,{atkMin:100,atkMax:100,matk:900,crit:0,accuracy:999,physicalAccuracy:physicalHit?200:80,magicAccuracy:physicalHit?80:200});
  p.target=m.uid;p.skill=null;p.yaw=Math.PI/2;const before=m.hp;f.world.beginPlayerAttack(p,m);
  const attack=f.world.state.pending.find(a=>a.actor===p.id);assert.equal(attack.damage,100);assert.equal(attack.accuracy,p.stats.physicalAccuracy);
  f.world.advance(attack.hitAt+300);assert.equal(before-m.hp,physicalHit?100:0);
  p.inventory.push({uid:'necro-book',id:'book_necro_10',count:1,plus:0});const beforeBook=m.hp;
  assert.equal(f.command({type:'castBook',bookId:'book_necro_10',targetId:m.uid}).ok,true);
  assert.equal(beforeBook-m.hp,physicalHit?0:1350);
 }
});

test('book contacts use physical/magic accuracy by damage path and a missed burning slash applies no DOT',()=>{
 const f=fixture('mage',()=>.005),p=f.hero(),m=f.monster;
 Object.assign(p.stats,{accuracy:999,physicalAccuracy:80,magicAccuracy:200});const before=m.hp;
 assert.equal(f.world.books.hit(p,m,100,'slash',{type:'physical',element:'none'}),false);assert.equal(m.hp,before);
 assert.equal(f.world.books.hit(p,m,100,'fire',{type:'magic',element:'fire'}),true);assert.equal(m.hp,before-100);
 const knight=fixture('knight',()=>.005);Object.assign(knight.hero().stats,{physicalAccuracy:80,magicAccuracy:200});
 knight.hero().inventory.push({uid:'burn-book',id:'book_knight_60',count:1,plus:0});
 assert.equal(knight.command({type:'castBook',bookId:'book_knight_60',targetId:knight.monster.uid}).ok,true);
 assert.equal(knight.monster.bookDots?.length??0,0);
});

test('existing skill preparation snapshots the matching damage and accuracy instead of the default alias',()=>{
 for(const id of Object.keys(CLASSES)){
  const f=fixture(id),p=f.hero(),m=f.monster;Object.assign(p.stats,{atkMin:100,atkMax:100,matk:900,crit:0,accuracy:999,physicalAccuracy:81,magicAccuracy:182});
  p.target=m.uid;p.skill=0;p.yaw=Math.PI/2;f.world.beginPlayerAttack(p,m);
  const attack=f.world.state.pending.find(a=>a.actor===p.id),magical=['mage','necro'].includes(id);
  assert.equal(attack.accuracy,magical?182:81,id);
  close(attack.damage,(magical?900:100)*CLASSES[id].skills[0].mul);
 }
});

test('loading an old stat snapshot populates both accuracy channels without healing the character',()=>{
 let serial=0;const store=new Store(),options={store,collision:new CollisionWorld(),now:1000,identifier:()=>`reload-attribute-${++serial}`,random:()=>.5};
 const first=new WorldSimulation(options),p=first.createCharacter('Старый герой','necro');
 p.hp=11;p.mp=7;delete p.stats.physicalAccuracy;delete p.stats.magicAccuracy;first.checkpoint();
 const second=new WorldSimulation(options),restored=second.state.characters[p.id];
 assert.ok(Number.isInteger(restored.stats.physicalAccuracy));assert.ok(Number.isInteger(restored.stats.magicAccuracy));
 assert.equal(restored.stats.accuracy,restored.stats.physicalAccuracy);assert.equal(restored.hp,11);assert.equal(restored.mp,7);
 assert.ok(restored.stats.attackInterval>0);assert.ok(restored.stats.manaRegen>0);
});

test('snapshot attack interval includes DEX and current book/haste multipliers exactly once',()=>{
 const f=fixture('ranger'),p=f.hero(),base=classCombatProfile('ranger',p.level,p.stats).attackInterval;
 close(f.world.snapshot(f.id).character.stats.attackInterval,base);
 f.world.books.effect(p,'book_ranger_40',p.id,10,{attackSpeed:25});p.buffs.haste=f.world.state.time+5000;f.world.recalculate(p);
 close(f.world.snapshot(f.id).character.stats.attackInterval,base/1.25/1.15);
 f.world.recalculate(p);close(p.stats.attackInterval,base/1.25/1.15);
 p.buffs.haste=0;f.world.recalculate(p);close(p.stats.attackInterval,base/1.25);
 f.world.state.time=12000;f.world.books.tick();close(p.stats.attackInterval,base);
});

test('DEX book buff recalculates each accuracy channel once and expires back to the equipment result',()=>{
 const f=fixture('ranger'),p=f.hero(),before=structuredClone(p.stats);
 f.world.books.effect(p,'book_ranger_20',p.id,1,{dex:10});
 assert.equal(p.stats.atkMin-before.atkMin,3);assert.equal(p.stats.physicalAccuracy-before.physicalAccuracy,3);assert.equal(p.stats.magicAccuracy,before.magicAccuracy);
 const buffed=structuredClone(p.stats);f.world.recalculate(p);assert.deepEqual(p.stats,buffed);
 f.world.state.time=2001;f.world.books.tick();assert.deepEqual(p.stats,before);
});
