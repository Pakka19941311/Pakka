import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {backupBeforeExpansion} from '../src/server/expansion-backup.mjs';

function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'varendor-expansion-backup-')),database=join(directory,'world.sqlite'),backups=join(directory,'backups');
 const store=new WorldStore(database),options={store,collision:new CollisionWorld(),now:1000,identifier:randomUUID};
 const world=new WorldSimulation(options),hero=world.createCharacter('Миграция','knight');
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 return {directory,database,backups,store,world,hero,options};
}

test('verified SQLite backup precedes level/accessory/quest migration and includes sparse storage and reserve',async t=>{
 const f=fixture(t),p=f.hero;
 Object.assign(p,{level:100,xp:123456,hp:17,accessoryMigrationVersion:undefined,starterProgress:undefined,progressionQuests:undefined,
  inventory:[{uid:'bag-potion',id:'potion',count:10,plus:0}],equipment:{ear2:{uid:'right-ear',id:'rift_ear_guard',count:1,plus:7}},
  storage:[null,{uid:'bank-ring',id:'rift_ring_blade',count:1,plus:5}],migrationReserve:[{uid:'reserve-material',id:'iron',count:6,plus:0}]});
 f.store.save(f.world.state);const original=f.store.load();
 const result=await backupBeforeExpansion(f.database,f.backups);
 assert.deepEqual(result.reasons,['accessories-v3','level-cap-90','starter-quests-v3','progression-quests-v3']);
 assert.equal(result.report.itemCount,4);assert.equal(result.report.allTablesAndStateFieldsEqual,true);assert.deepEqual(f.store.load(),original);
 const backup=new WorldStore(result.filename);
 try{
  assert.deepEqual(backup.load(),original);
  const upgraded=new WorldSimulation(f.options),next=upgraded.state.characters[p.id];
  assert.equal(next.level,90);assert.equal(next.hp,17);assert.equal(next.equipment.ear2,undefined);
  assert.ok(next.inventory.some(i=>i.uid==='right-ear'));assert.equal(next.storage[0],null);
  assert.equal(backup.load().characters[p.id].level,100);assert.equal(backup.load().characters[p.id].equipment.ear2.uid,'right-ear');
  assert.equal(await backupBeforeExpansion(f.database,f.backups),null);
  assert.equal(readdirSync(f.backups).length,1);
 }finally{backup.close();}
});

test('a failed backup leaves existing save untouched and does not acknowledge migration',async t=>{
 const f=fixture(t);f.hero.accessoryMigrationVersion=undefined;f.store.save(f.world.state);const before=f.store.load();
 await assert.rejects(backupBeforeExpansion(f.database,f.backups,undefined,async()=>{throw Error('backup-disk-full');}),/backup-disk-full/);
 assert.deepEqual(f.store.load(),before);
 await assert.rejects(backupBeforeExpansion(f.database,f.backups,undefined,async()=>({filename:'missing',report:{}})),/not-verified/);
 assert.deepEqual(f.store.load(),before);
});

test('each new population digest requires a verified copy even when character migrations are complete',async t=>{
 const f=fixture(t),plan={mode:'starter-v3',version:'p2-1',digest:'layout-a'};
 const first=await backupBeforeExpansion(f.database,f.backups,plan);assert.deepEqual(first.reasons,['starter-population-v3']);
 Object.assign(f.world.state,{starterPopulationVersion:plan.version,starterPopulationDigest:plan.digest});f.store.save(f.world.state);
 assert.equal(await backupBeforeExpansion(f.database,f.backups,plan),null);
 assert.deepEqual((await backupBeforeExpansion(f.database,f.backups,{...plan,digest:'layout-b'})).reasons,['starter-population-v3']);
 assert.equal(await backupBeforeExpansion(join(f.directory,'new-world.sqlite'),f.backups,plan),null);
});

test('changed P2 geometry is backed up independently of unchanged population',async t=>{
 const f=fixture(t),plan={mode:'starter-v3',version:'p2-1',digest:'layout-a',mapVersion:'new-house'};
 Object.assign(f.world.state,{starterPopulationVersion:plan.version,starterPopulationDigest:plan.digest,mapVersion:'old-house'});f.store.save(f.world.state);
 const result=await backupBeforeExpansion(f.database,f.backups,plan);
 assert.deepEqual(result.reasons,['world-geometry-v3']);
 const original=new WorldStore(result.filename);
 try{assert.equal(original.load().mapVersion,'old-house');}finally{original.close();}
 f.world.state.mapVersion=plan.mapVersion;f.store.save(f.world.state);
 assert.equal(await backupBeforeExpansion(f.database,f.backups,plan),null);
});
