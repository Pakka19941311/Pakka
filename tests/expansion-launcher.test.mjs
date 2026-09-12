import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {stageNativeServer} from '../scripts/package-godot-pc.mjs';

test('staged Windows launcher verifies the original save before P2 migration and resumes without another migration',async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'varendor-expansion-launcher-')),stage=join(temporary,'application');let bridge;
 const options={data:join(temporary,'save'),backups:join(temporary,'backups')};
 try{
  stageNativeServer(resolve('.'),stage,{finalWorld:true,populationMode:'legacy'});
  const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
  bridge=await startNativeBridge(options);
  const p=bridge.service.world.createCharacter('Synthetic expansion upgrade','knight');
  const id=p.id;
  Object.assign(p,{level:100,xp:12345,hp:17,starterProgress:undefined,accessoryMigrationVersion:undefined});
  p.inventory=[];p.equipment.ear2={uid:'keep-original-ear',id:'rift_ear_guard',count:1,plus:7};
  p.storage=[null,{uid:'keep-bank-ring',id:'rift_ring_blade',count:1,plus:5}];
  const boss=bridge.service.world.state.monsters.find(m=>m.id==='cave_boss');
  Object.assign(boss,{alive:false,hp:0,respawnAt:bridge.service.world.state.time+1800000});
  const bossUid=boss.uid;
  await bridge.close();bridge=null;
  const sourceDb=new DatabaseSync(join(options.data,'world.sqlite'),{readOnly:true});let source;
  try{source=JSON.parse(sourceDb.prepare('SELECT state FROM world WHERE id=1').get().state);}finally{sourceDb.close();}
  writeFileSync(join(stage,'world-runtime.json'),JSON.stringify({schema:1,populationMode:'starter-v3'}));
  bridge=await startNativeBridge(options);
  const upgraded=bridge.service.world.state.characters[id];
  assert.equal(upgraded.level,90);assert.equal(upgraded.hp,17);assert.equal(upgraded.equipment.ear2,undefined);
  assert.ok(upgraded.inventory.some(i=>i.uid==='keep-original-ear'));assert.equal(upgraded.storage[0],null);
  assert.equal(upgraded.storage[1].uid,'keep-bank-ring');
  const state=bridge.service.world.state;
  assert.equal(state.monsters.length,1151);assert.equal(new Set(state.monsters.map(m=>m.uid)).size,1151);
  assert.equal(state.monsters.find(m=>m.uid===bossUid).alive,false);
  // The server rebases persisted game clocks when reopening. Offline wall
  // time must not count toward the accepted 30-minute in-game respawn.
  const oldRemaining=source.monsters.find(m=>m.uid===bossUid).respawnAt-source.time;
  const newRemaining=state.monsters.find(m=>m.uid===bossUid).respawnAt-state.time;
  assert.ok(Math.abs(newRemaining-oldRemaining)<150);
  const bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));
  assert.equal(bootstrap.profiles.find(x=>x.id===id).level,90);
  const report=JSON.parse(readFileSync(join(options.data,'world-expansion-v3-backup.json'),'utf8'));
  assert.ok(report.reasons.includes('starter-population-v3'));assert.equal(report.report.allTablesAndStateFieldsEqual,true);
  const backupDb=new DatabaseSync(report.filename,{readOnly:true});
  try{assert.deepEqual(JSON.parse(backupDb.prepare('SELECT state FROM world WHERE id=1').get().state),source);}finally{backupDb.close();}
  const backupNames=readdirSync(options.backups);
  await bridge.close();bridge=null;bridge=await startNativeBridge(options);
  assert.deepEqual(readdirSync(options.backups),backupNames);
  assert.equal(bridge.service.world.state.monsters.length,1151);
  assert.equal(bridge.service.world.state.monsters.find(m=>m.uid===bossUid).alive,false);
  assert.equal(bridge.service.world.state.characters[id].inventory.filter(i=>i.uid==='keep-original-ear').length,1);
 }finally{
  if(bridge)await bridge.close();assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+sep));rmSync(temporary,{recursive:true,force:true});
 }
});

test('staged launcher aborts before migration when the backup destination cannot be created',async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'varendor-expansion-launcher-')),stage=join(temporary,'application');let bridge;
 const options={data:join(temporary,'save'),backups:join(temporary,'backups')};
 try{
  stageNativeServer(resolve('.'),stage);
  const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
  bridge=await startNativeBridge(options);
  const p=bridge.service.world.createCharacter('Backup failure synthetic','knight');p.level=100;p.accessoryMigrationVersion=undefined;
  await bridge.close();bridge=null;
  const read=()=>{const db=new DatabaseSync(join(options.data,'world.sqlite'),{readOnly:true});try{return db.prepare('SELECT state FROM world WHERE id=1').get().state;}finally{db.close();}};
  const before=read();writeFileSync(options.backups,'A file deliberately blocks the backup directory.');
  await assert.rejects(startNativeBridge(options),/EEXIST|ENOTDIR/);
  assert.equal(read(),before);assert.equal(existsSync(join(options.data,'running.json')),false);
 }finally{
  if(bridge)await bridge.close();assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+sep));rmSync(temporary,{recursive:true,force:true});
 }
});
