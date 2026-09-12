import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorldStore } from '../server/world-store.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { backupWorld, inspectWorld } from '../scripts/p0-backup-world.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'varendor-p0-test-'));
  const source = join(dir, 'source.sqlite');
  const store = new WorldStore(source);
  store.db.exec('PRAGMA wal_autocheckpoint=0');
  let serial=0;
  const world = new WorldSimulation({store,collision:new CollisionWorld(),now:1000,
    identifier:()=>`fixture-${++serial}`,random:()=>0.5,beta:true});
  const hero=world.createCharacter('P0 synthetic fixture','knight');
  hero.gold=1234; hero.xp=17; hero.quest=2; hero.kills=4; hero.hp=99;
  // New knights keep their original weapon in the bag. This backup fixture
  // deliberately equips it before testing an enhancement receipt.
  const weaponIndex=hero.inventory.findIndex(item=>item.id==='wardens_blade');
  assert.ok(weaponIndex>=0);
  hero.equipment.weapon=hero.inventory.splice(weaponIndex,1)[0];
  const command={type:'enhance',item:structuredClone(hero.equipment.weapon),scroll:structuredClone(hero.inventory.find(i=>i.id==='weapon_scroll'))};
  const receipt=world.command(hero.id,'p0-receipt-fixture',command);
  assert.equal(receipt.ok,true);
  t.after(()=>store.close());
  return {dir,source,store,world,hero,command,receipt};
}

test('WAL backup includes committed items/progress/receipt; isolated restart returns same receipt',async t=>{
  const f=fixture(t);
  assert.ok(existsSync(f.source+'-wal'));
  const before=inspectWorld(f.store.db);
  const result=await backupWorld(f.source,join(f.dir,'backups'));
  assert.deepEqual(inspectWorld(f.store.db),before);
  assert.equal(result.report.allTablesAndStateFieldsEqual,true);
  assert.equal(result.report.browserProfileBackedUp,false);
  const restored=new WorldStore(result.filename);
  try {
    const state=restored.load(); assert.deepEqual(state,f.world.state);
    const world=new WorldSimulation({store:restored,collision:new CollisionWorld(),now:state.time,
      identifier:()=>{throw Error('unexpected new identity');},beta:true});
    const hero=world.state.characters[f.hero.id];
    assert.equal(hero.gold,1234); assert.equal(hero.xp,17); assert.equal(hero.quest,2);
    assert.equal(hero.hp,99); assert.equal(hero.equipment.weapon.uid,f.hero.equipment.weapon.uid);
    assert.deepEqual(world.command(hero.id,'p0-receipt-fixture',f.command),f.receipt);
    assert.equal(hero.inventory.find(i=>i.id==='weapon_scroll').count,99);
  } finally {restored.close();}
});

test('unknown schema is refused without changing the source',async t=>{
  const f=fixture(t); f.world.state.schema=99; f.store.save(f.world.state);
  const state=readFileSync(f.source+'-wal');
  await assert.rejects(backupWorld(f.source,join(f.dir,'backups')),/unsupported-world-schema/);
  assert.deepEqual(readFileSync(f.source+'-wal'),state);
  assert.deepEqual(readdirSync(join(f.dir,'backups')),[]);
});

test('duplicate item UID is reported, never silently repaired',async t=>{
  const f=fixture(t); f.hero.inventory[0].uid=f.hero.equipment.weapon.uid; f.world.checkpoint();
  await assert.rejects(backupWorld(f.source,join(f.dir,'backups')),/duplicate-item-uid/);
  assert.equal(f.store.load().characters[f.hero.id].inventory[0].uid,f.hero.equipment.weapon.uid);
});

test('unclaimed progression rewards are preserved and share the global item UID namespace',async t=>{
  const f=fixture(t), before=inspectWorld(f.store.db);
  f.hero.progressionQuests.quests.QUEST150={status:'reward-pending',pendingItems:[{uid:'pending-class-book',id:'book_knight_50',count:1,plus:0}]};
  f.world.checkpoint();
  const result=await backupWorld(f.source,join(f.dir,'backups'));
  assert.equal(result.report.itemCount,before.itemCount+1);
  const restored=new WorldStore(result.filename);
  try {assert.deepEqual(restored.load().characters[f.hero.id].progressionQuests,f.hero.progressionQuests);}
  finally {restored.close();}
  f.hero.progressionQuests.quests.QUEST150.pendingItems[0].uid=f.hero.equipment.weapon.uid;
  f.world.checkpoint();
  await assert.rejects(backupWorld(f.source,join(f.dir,'backups')),/duplicate-item-uid/);
});

test('a backup cannot overwrite a previous backup or enter a Git checkout',async t=>{
  const f=fixture(t); const parent=join(f.dir,'backups');
  const a=await backupWorld(f.source,parent); const saved=readFileSync(a.filename);
  const b=await backupWorld(f.source,parent);
  assert.notEqual(a.filename,b.filename); assert.deepEqual(readFileSync(a.filename),saved);
  mkdirSync(join(f.dir,'repo','.git'),{recursive:true});
  await assert.rejects(backupWorld(f.source,join(f.dir,'repo','backups')),/inside-git/);
});

test('empty SQLite is not labelled a restored player database',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'varendor-p0-empty-')); const file=join(dir,'empty.sqlite');
  const db=new DatabaseSync(file); db.close();
  await assert.rejects(backupWorld(file,join(dir,'backups')),/unsupported-table-schema/);
});
