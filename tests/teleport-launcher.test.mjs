import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {stageNativeServer} from '../scripts/package-godot-pc.mjs';
import {applyExperience} from '../src/core/gameplay-session.ts';
import {MONSTERS} from '../src/data/game-data.ts';

test('shipped launcher backs up a damaged save, restores confirmed progress once, and preserves items',async()=>{
 const parent=resolve('..'),temporary=mkdtempSync(join(parent,'.teleport-launcher-')),stage=join(temporary,'application');
 let bridge;
 try{
  stageNativeServer(resolve('.'),stage);
  const {startNativeBridge}=await import(pathToFileURL(join(stage,'launch-native.mjs')));
  const options={data:join(temporary,'save'),backups:join(temporary,'backups')};
  bridge=await startNativeBridge(options);
  const p=bridge.service.world.createCharacter('Recovered preview','knight');
  Object.assign(p,{level:10,xp:16000});bridge.service.world.recalculate(p);
  const expected=applyExperience(10,p.xp,MONSTERS.wolf.xp*20);
  const bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));
  bootstrap.profiles=[{id:p.id,classId:p.classId,level:p.level}];writeFileSync(bridge.bootstrapPath,JSON.stringify(bootstrap));
  p.level=1;p.cost=0;
  const monster=bridge.service.world.state.monsters.find(m=>m.id==='wolf');
  bridge.service.world.damage(monster,monster.hp+1,p,false);
  const broken=structuredClone(p),id=p.id;await bridge.close();bridge=null;
  bridge=await startNativeBridge(options);
  const restored=bridge.service.world.state.characters[id];
  assert.equal(restored.level,expected.level);assert.equal(restored.xp,expected.xp);
  assert.deepEqual(restored.inventory,broken.inventory);assert.deepEqual(restored.equipment,broken.equipment);
  const record=bridge.service.world.state.teleportProgressRepairs[0];
  const backup=new DatabaseSync(record.backup,{readOnly:true});
  try{const source=JSON.parse(backup.prepare('SELECT state FROM world WHERE id=1').get().state).characters[id];assert.equal(source.level,broken.level);assert.equal(source.xp,broken.xp);assert.deepEqual(source.inventory,broken.inventory);}finally{backup.close();}
  await bridge.close();bridge=null;bridge=await startNativeBridge(options);
  assert.equal(bridge.service.world.state.teleportProgressRepairs.length,1);
  assert.equal(bridge.service.world.state.characters[id].level,expected.level);
 }finally{
  if(bridge)await bridge.close();assert.ok(resolve(temporary).startsWith(parent+sep));rmSync(temporary,{recursive:true,force:true});
 }
});
