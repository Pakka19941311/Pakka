import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {RING_ITEMS,CLOAK_ITEMS,CRAFT_MATERIAL_ITEMS,RING_RECIPES,itemSellPrice} from '../src/data/accessories-v3.ts';
import {rollAccessoryLoot,MATERIAL_SOURCES} from '../src/data/accessory-loot-v3.ts';
import {MOBS_V3,MINI_BOSSES_V3,MAJOR_BOSSES_V3} from '../src/data/world-expansion-v3.ts';
import {ITEMS,MONSTERS,EQUIP_SLOTS} from '../src/data/game-data.ts';
import {rollLootV3,GOLEM_EQUIPMENT} from '../src/data/loot-v3.ts';
import {rollNightDrops} from '../src/world/world-cycle.ts';
import {SERVICES} from '../src/world/territory.ts';
import {craftRing} from '../src/core/ring-crafting.ts';
import {migrateAccessories,claimMigrationItem} from '../src/core/accessory-migration.ts';
import {integerItemStats} from '../src/core/item-progression.ts';
import {enhanceItem,scrollChance,enhancementCategory,SCROLLS} from '../src/core/enhancement-v2.ts';
import {equipInventoryItem,itemReference} from '../src/core/inventory-commands.ts';
import {parseBetaSave} from '../src/server/beta-import.ts';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {WorldStore} from '../server/world-store.mjs';
const item=(uid,id,plus=0,count=1)=>({uid,id,plus,count});
const definition=i=>ITEMS[i.id];
class Store{
 state=null;receipts=new Map();fail=false;
 load(){return this.state?structuredClone(this.state):null;}save(s){this.state=structuredClone(s);}
 receipt(id,key){return this.receipts.get(id+key);}
 commit(s,id,key,c,r){if(this.fail)throw Error('disk failure');this.save(s);this.receipts.set(id+key,r);}
}
function fixture(store=new Store()){
 let serial=0,draws=0;const rolls=[];
 const options={store,now:1000,collision:new CollisionWorld(),identifier:()=>`craft-${++serial}`,random:()=>{draws++;return rolls.shift()??.5;}};
 const world=new WorldSimulation(options),id=world.createCharacter('Кольца','knight').id;
 world.heartbeat(id);world.state.monsters=[];
 const hero=()=>world.state.characters[id];Object.assign(hero(),{x:100,z:100,level:90,equipment:{},inventory:[],gold:99999});world.recalculate(hero());
 const command=value=>world.command(id,`accessory-command-${++serial}`,value);
 const seed=(recipeId='ring_str_g1',extra=3)=>{
  const recipe=RING_RECIPES.find(r=>r.id===recipeId);
  hero().inventory=[item('main-input',recipe.targetId),...recipe.materials.map((m,i)=>item(`material-${i}`,m.id,0,m.count+extra))];
  return {type:'craftRing',recipeId,target:itemReference(hero().inventory[0]),materials:hero().inventory.slice(1).map(itemReference)};
 };
 return {world,store,options,id,hero,command,seed,rolls,draws:()=>draws};
}

test('catalogue contains 18 rings, three exact cloaks, twelve priced materials and a statless single blank',()=>{
 assert.equal(Object.keys(RING_ITEMS).length,18);assert.equal(RING_RECIPES.length,15);
 for(const family of ['str','dex','int','blade','soul','ember'])assert.deepEqual(Object.values(RING_ITEMS).filter(r=>r.ringFamily===family).map(r=>r.ringGrade),[1,2,3]);
 assert.deepEqual([RING_ITEMS.ring_str_g3.str,RING_ITEMS.ring_str_g3.hp,RING_ITEMS.ring_str_g3.accuracy],[4,30,1]);
 assert.deepEqual([RING_ITEMS.ring_dex_g3.dex,RING_ITEMS.ring_dex_g3.accuracy,RING_ITEMS.ring_dex_g3.evasion],[4,2,1]);
 assert.deepEqual([RING_ITEMS.ring_int_g3.int,RING_ITEMS.ring_int_g3.mp,RING_ITEMS.ring_int_g3.mdef],[4,30,1]);
 assert.deepEqual(RING_ITEMS.rift_ring_blade_g3.atk,[6,9]);assert.equal(RING_ITEMS.rift_ring_soul_g3.matk,16);assert.equal(RING_ITEMS.ember_ring_g3.matk,15);
 assert.equal(Object.keys(CLOAK_ITEMS).length,3);assert.equal(EQUIP_SLOTS.includes('ear2'),false);assert.equal(EQUIP_SLOTS.includes('cloak'),true);
 assert.deepEqual([CLOAK_ITEMS.cloak_defense.def,CLOAK_ITEMS.cloak_captain.def,CLOAK_ITEMS.cloak_captain.mdef,CLOAK_ITEMS.cloak_captain.str,CLOAK_ITEMS.cloak_captain.dex,CLOAK_ITEMS.cloak_captain.int,CLOAK_ITEMS.cloak_sky.evasion,CLOAK_ITEMS.cloak_sky.crit],[2,1,2,1,1,1,2,2]);
 assert.deepEqual(Object.entries(CRAFT_MATERIAL_ITEMS).filter(([id])=>id.startsWith('mat_')).map(([,d])=>itemSellPrice(d)),[2,5,12,3,3,3,2,10,25,50,50,50]);
 assert.ok(Object.values(integerItemStats(CRAFT_MATERIAL_ITEMS.ring_blank,0)).every(n=>n===0));assert.equal(CRAFT_MATERIAL_ITEMS.ring_blank.maxStack,1);
});

test('all fifteen recipes enforce exact material triples, fees and success/failure boundaries',()=>{
 for(const recipe of RING_RECIPES){
  for(const success of [true,false]){
   const f=fixture(),command=f.seed(recipe.id),before=structuredClone(f.hero());let draws=0;
   const result=craftRing(f.hero(),command,()=>{draws++;return success?recipe.chance-1e-12:recipe.chance;},()=>`result-${recipe.id}`);
   assert.equal(result.outcome.success,success,recipe.id);assert.equal(draws,1);assert.deepEqual(f.hero(),before);
   assert.equal(result.gold,before.gold-recipe.fee);assert.ok(!result.inventory.some(i=>i.uid===command.target.uid));
   recipe.materials.forEach((m,index)=>assert.equal(result.inventory.find(i=>i.uid===command.materials[index].uid).count,3));
   if(success){assert.equal(result.outcome.result.id,recipe.resultId);assert.equal(result.outcome.result.plus,0);assert.notEqual(result.outcome.result.uid,command.target.uid);}
   else assert.equal(result.outcome.result,null);
  }
 }
});

test('invalid or stale inputs, equipped targets, insufficient funds, G3 cap and duplicate UIDs spend nothing and draw no RNG',()=>{
 const changes=[
  (f,c)=>{c.recipeId='ring_str_g4';},(f,c)=>{c.materials.pop();},(f,c)=>{c.materials[1]=c.materials[0];},
  (f,c)=>{c.target.count++;},(f,c)=>{f.hero().inventory[1].count--;},
  (f,c)=>{f.hero().inventory[1].count=1;c.materials[0]=itemReference(f.hero().inventory[1]);},
  (f,c)=>{f.hero().inventory[1].id='iron';c.materials[0]=itemReference(f.hero().inventory[1]);},
  (f,c)=>{f.hero().equipment.ring1=f.hero().inventory.shift();},
  (f,c)=>{f.hero().gold=0;},(f,c)=>{f.hero().inventory[0].id='ring_dex_g1';c.target=itemReference(f.hero().inventory[0]);},
  (f,c)=>{f.hero().storage=[{...f.hero().inventory[0]}];},
 ];
 for(const change of changes){const f=fixture(),c=f.seed();change(f,c);const before=structuredClone(f.hero()),draws=f.draws();
  assert.equal(f.command(c).ok,false);assert.deepEqual(f.hero(),before);assert.equal(f.draws(),draws);
 }
});

test('a full bag replaces the exact target cell; a failed craft destroys only its four inputs and fee',()=>{
 for(const success of [true,false]){
  const f=fixture(),c=f.seed('ring_str_g1',0);while(f.hero().inventory.length<42)f.hero().inventory.push(item(`spare-${f.hero().inventory.length}`,'potion'));
  const spares=structuredClone(f.hero().inventory.slice(4)),gold=f.hero().gold;f.rolls.push(success?0:.9);
  const receipt=f.command(c);assert.equal(receipt.ok,true);assert.equal(receipt.outcome.success,success);
  assert.deepEqual(f.hero().inventory.filter(i=>i.uid.startsWith('spare-')),spares);assert.equal(f.hero().gold,gold-150);
  assert.equal(f.hero().inventory.length,success?39:38);if(success)assert.equal(f.hero().inventory[0].uid,receipt.outcome.result.uid);
 }
 const f=fixture(),c=f.seed('ring_str_g1',9);while(f.hero().inventory.length<42)f.hero().inventory.push(item(`full-${f.hero().inventory.length}`,'potion'));
 assert.equal(f.command(c).ok,true);assert.equal(f.hero().inventory.length,42);
});

test('server craft is allowed in a clear field but blocked by movement, airborne state and actual combat',()=>{
 for(const mutate of [f=>{f.hero().direction.x=1;},f=>{f.hero().velocityZ=.5;},f=>{f.hero().grounded=false;},f=>{f.hero().target='enemy';},f=>{f.hero().hitUntil=2000;},f=>{f.hero().dead=true;},
  f=>{f.world.state.pending.push({actor:'hostile',target:f.id});},f=>{f.world.state.projectiles.push({actor:f.id});},
  f=>{f.world.state.monsters.push({id:'wolf',uid:'nearby',alive:true,x:101,z:100,spaceId:'surface'});},
  f=>{f.world.state.monsters.push({id:'wolf',uid:'chasing',alive:true,x:150,z:100,spaceId:'surface',targetId:f.id});}]){
  const f=fixture(),c=f.seed();mutate(f);const before=structuredClone(f.hero());assert.equal(f.command(c).ok,false);assert.deepEqual(f.hero(),before);
 }
 const f=fixture(),c=f.seed();assert.equal(f.world.safe(f.hero()),false);assert.equal(f.command(c).ok,true);
});

test('SQL receipt survives restart and a repeated craft never duplicates the result or consumes another set',t=>{
 const directory=mkdtempSync(join(tmpdir(),'varendor-craft-')),file=join(directory,'world.sqlite');let store=new WorldStore(file);
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 const f=fixture(store),c=f.seed(),before=f.hero().gold;
 const first=f.world.command(f.id,'sqlite-craft-once',c);assert.equal(first.ok,true);
 assert.deepEqual(f.world.command(f.id,'sqlite-craft-once',c),first);assert.equal(f.hero().gold,before-150);
 store.close();store=new WorldStore(file);const restarted=new WorldSimulation({...f.options,store});restarted.heartbeat(f.id);
 assert.deepEqual(restarted.command(f.id,'sqlite-craft-once',c),first);
 assert.equal(restarted.state.characters[f.id].inventory.filter(i=>i.id==='ring_str_g1').length,1);
 assert.equal(restarted.command(f.id,'sqlite-stale-craft',c).reason,'stale-item');
});

test('persistence failure rolls inventory, money and new result back as one transaction',()=>{
 const f=fixture(),c=f.seed(),before=structuredClone(f.hero());f.store.fail=true;
 assert.throws(()=>f.command(c),/disk failure/);assert.deepEqual(f.hero(),before);assert.equal(f.store.receipts.size,0);
});

test('all ring and spoofed-slot enhancement paths reject without consuming a scroll; cloaks use armor curves',()=>{
 for(const slot of ['ring','ring1','ring2'])for(const scrollId of Object.keys(SCROLLS))assert.equal(scrollChance(scrollId,slot,0),0);
 for(const [id,d] of Object.entries(RING_ITEMS))for(const location of ['bag','equipment']){
  const ring=item('ring',id),scroll=item('scroll','armor_scroll',0,5),state={dead:false,inventory:location==='bag'?[scroll,ring]:[scroll],equipment:location==='bag'?{}:{weapon:ring}},before=structuredClone(state);
  assert.equal(enhanceItem(state,itemReference(scroll),{...itemReference(ring),location,slot:'weapon'},()=>({slot:'weapon'}),0).ok,false);assert.deepEqual(state,before);
  assert.deepEqual(integerItemStats(d,15),integerItemStats(d,0));
 }
 assert.equal(enhancementCategory('cloak'),'armor');
 for(const plus of [0,1,3,6,15]){
  const captain=integerItemStats(CLOAK_ITEMS.cloak_captain,plus);assert.equal(captain.str,1);assert.equal(captain.dex,1);assert.equal(captain.int,1);assert.equal(captain.atkMin,0);
 }
});

test('full inventory migration preserves ear2, enhanced rings and sparse storage exactly once, then claims by UID',()=>{
 const f=fixture(),p=f.hero();p.accessoryMigrationVersion=undefined;p.level=1;
 p.inventory=Array.from({length:42},(_,n)=>item(`bag-${n}`,'potion'));p.inventory[3]=item('legacy-ember','ember_ring',3);
 p.equipment={ear1:item('left-ear','rift_ear_guard',2),ear2:item('right-ear','rift_ear_soul',4),ring1:item('old-soul','rift_ring_soul',7)};
 p.storage=Array(500).fill(null);p.storage[499]=item('stored-ring','rift_ring_blade',2);p.lootBuffer=[item('buffer-ring','ember_ring',1)];
 const old=structuredClone(p),right=structuredClone(p.equipment.ear2);f.world.checkpoint();
 const restarted=new WorldSimulation(f.options),hero=()=>restarted.state.characters[f.id];restarted.heartbeat(f.id);
 assert.equal(hero().equipment.ear2,undefined);assert.deepEqual(hero().equipment.ear1,old.equipment.ear1);assert.deepEqual(hero().migrationReserve,[right]);
 const migrated=hero().equipment.ring1;assert.equal(migrated.uid,'old-soul');assert.equal(migrated.plus,0);assert.equal(migrated.legacyRingBonus.matk,9);assert.equal(migrated.legacyRingBonus.crit,3);
 assert.equal(hero().storage[499].uid,'stored-ring');assert.equal(hero().storage[498],null);assert.equal(hero().storage.length,500);
 assert.deepEqual(restarted.state.accessoryMigrationBackups[f.id].items.equipment.ear2,right);
 assert.equal(restarted.state.accessoryMigrationBackups[f.id].items.equipment.ring1.plus,7);
 assert.equal(restarted.command(f.id,'claim-full-reserve',{type:'claimMigration',item:itemReference(right)}).reason,'bag-full');
 hero().inventory.pop();const receipt=restarted.command(f.id,'claim-right-ear-1',{type:'claimMigration',item:itemReference(right)});assert.equal(receipt.ok,true);
 assert.deepEqual(restarted.command(f.id,'claim-right-ear-1',{type:'claimMigration',item:itemReference(right)}),receipt);assert.equal(hero().inventory.filter(i=>i.uid===right.uid).length,1);assert.equal(hero().migrationReserve.length,0);
 const before=structuredClone({inventory:hero().inventory,equipment:hero().equipment,storage:hero().storage,migrationReserve:hero().migrationReserve});
 const again=new WorldSimulation(f.options),a=again.state.characters[f.id];assert.deepEqual({inventory:a.inventory,equipment:a.equipment,storage:a.storage,migrationReserve:a.migrationReserve},before);
});

test('migration preserves unknown rings in recovery and original low-level rights; successful upgrades carry one fixed bonus',()=>{
 const old={classId:'knight',level:1,dead:false,inventory:[item('old','ember_ring',5)],equipment:{ear2:item('ear','rift_ear_guard')}};
 const converted=migrateAccessories(old,definition).state,ring=converted.inventory.find(i=>i.uid==='old');
 assert.equal(equipInventoryItem({...converted,classId:'knight',level:1,dead:false},itemReference(ring),definition).ok,true);
 const f=fixture(),c=f.seed('ember_ring_g2');f.hero().inventory[0]={...ring};c.target=itemReference(ring);const receipt=f.command(c);
 assert.equal(receipt.ok,true);assert.deepEqual(receipt.outcome.result.legacyRingBonus,ring.legacyRingBonus);assert.notEqual(receipt.outcome.result.uid,ring.uid);assert.equal(receipt.outcome.result.legacyRingLevelExempt,undefined);
 const rare=item('unknown-uid','removed_legacy_ring',11),state={inventory:[rare],equipment:{}};const result=migrateAccessories(state,()=>({slot:'ring'}));
 assert.deepEqual(result.state.migrationReserve,[rare]);assert.equal(result.state.inventory.length,0);assert.deepEqual(state.inventory,[rare]);
 assert.throws(()=>claimMigrationItem(result.state,itemReference(rare),()=>false),/unknown-recovery-item/);assert.deepEqual(result.state.migrationReserve,[rare]);
});

test('private import still accepts old right earrings and keeps converted-ring metadata and sparse reserve/storage',()=>{
 const raw={schema:2,player:{classId:'knight',name:'Импорт',level:100,xp:5,gold:50,x:12,z:-9,hp:10,mp:3,inventory:[],equipment:{ear2:item('ear','rift_ear_guard',2)},storage:[null,item('old-ring','ember_ring',7)],migrationReserve:[{...item('converted','rift_ring_soul'),ringMigrationVersion:1,legacyRingBonus:{matk:9},legacyRingLevelExempt:true}]}};
 const parsed=parseBetaSave(raw);assert.equal(parsed.level,100);assert.equal(parsed.equipment.ear2.uid,'ear');assert.equal(parsed.storage[0],null);assert.equal(parsed.storage[1].plus,7);assert.equal(parsed.migrationReserve[0].legacyRingBonus.matk,9);
 const migrated=migrateAccessories(parsed,definition).state;assert.equal(migrated.equipment.ear2,undefined);assert.equal(migrated.inventory.find(i=>i.uid==='ear').plus,2);assert.equal(migrated.storage[1].legacyRingBonus.matk,9);
});

test('ordinary ring drops disappear from every pool while boss families and cave weapon-only exception remain',()=>{
 assert.ok(GOLEM_EQUIPMENT.every(id=>ITEMS[id].slot!=='ring'));
 for(const [id,m] of Object.entries(MONSTERS))if(!('boss' in m)&&id!=='cave_boss'){
  assert.ok(m.drops.every(([itemId])=>ITEMS[itemId]?.slot!=='ring'));
  for(const roll of [0,.01,.1,.3,.5,.7,.999999])assert.ok(rollLootV3(id,()=>roll).every(d=>ITEMS[d.id].slot!=='ring'),id);
 }
 assert.deepEqual(rollNightDrops(()=>0),['weapon_scroll_improved']);
 for(const id of ['mini','big','rift_boss']){const drops=rollLootV3(id,()=>0),rings=drops.filter(d=>ITEMS[d.id].slot==='ring');assert.equal(rings.length,1);assert.equal(RING_ITEMS[rings[0].id].ringGrade,1);}
 const cave=rollLootV3('cave_boss',()=>0);assert.ok(cave.every(d=>!Object.hasOwn(RING_ITEMS,d.id)&&!d.id.startsWith('mat_')&&!d.id.startsWith('cloak_')));
 for(const id of Object.keys(MATERIAL_SOURCES))assert.ok(rollAccessoryLoot(id,()=>0).every(d=>d.id.startsWith('mat_')));
 assert.equal(rollAccessoryLoot('RB-101',()=>0).some(d=>d.id.includes('ring')),false);assert.equal(rollAccessoryLoot('RB-104',()=>0).find(d=>d.id.includes('ring')).id,'rift_ring_soul');
});

test('all canonical and runtime species IDs share loot and RNG draws, including retained legacy aliases',()=>{
 const sample=(id,offset)=>{let draws=0;const drops=rollAccessoryLoot(id,()=>[0,.08,.19,.34,.69,.99][(draws+++offset)%6]);return {drops,draws};};
 for(const entry of [...MOBS_V3,...MINI_BOSSES_V3,...MAJOR_BOSSES_V3])for(let offset=0;offset<6;offset++){
  const canonical=sample(entry.id,offset);assert.deepEqual(sample(entry.speciesId,offset),canonical,entry.speciesId);
  if(entry.legacySpeciesId)assert.deepEqual(sample(entry.legacySpeciesId,offset),canonical,entry.legacySpeciesId);
 }
 assert.deepEqual(rollAccessoryLoot('v3_forest_boar',()=>0),[{id:'mat_04',count:1}]);
 assert.deepEqual(rollAccessoryLoot('v3_armored_beetle',()=>0),[{id:'mat_01',count:1}]);
 assert.deepEqual(sample('cave_boss',0),{drops:[],draws:0});
});

test('new smith purchases and material sale prices are authoritative; blanks and material stacks keep their limits',()=>{
 const f=fixture(),p=f.hero();Object.assign(p,{x:SERVICES['npc:smith'].x,z:SERVICES['npc:smith'].z});const gold=p.gold;
 assert.equal(f.command({type:'buy',itemId:'ring_blank'}).ok,true);assert.equal(f.command({type:'buy',itemId:'ring_blank'}).ok,true);assert.equal(f.hero().inventory.filter(i=>i.id==='ring_blank').length,2);assert.equal(f.hero().gold,gold-100);
 assert.equal(f.command({type:'buy',itemId:'cloak_defense'}).ok,true);assert.equal(f.hero().gold,gold-450);
 f.hero().inventory.push(item('materials','mat_09',0,999));f.world.addItem(f.hero(),'mat_09');assert.deepEqual(f.hero().inventory.filter(i=>i.id==='mat_09').map(i=>i.count),[999,1]);
 const trade=f.command({type:'tradeOpen',npcId:'npc:smith'}).outcome,before=f.hero().gold;
 assert.equal(f.command({type:'sell',item:itemReference(f.hero().inventory.find(i=>i.uid==='materials')),quantity:3,trade}).ok,true);assert.equal(f.hero().gold,before+75);
 Object.assign(f.hero(),{x:SERVICES['npc:shop'].x,z:SERVICES['npc:shop'].z});assert.equal(f.command({type:'buy',itemId:'ring_blank'}).reason,'shop-unavailable');
});
