import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {stageNativeServer} from '../scripts/package-godot-pc.mjs';
import {FinalWorld} from '../src/world/final-world.ts';

for(const populationMode of ['legacy','starter-v3'])test(`staged ${populationMode} FinalWorld loads the complete authoritative geometry without render assets`,async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'varendor-native-geometry-'));
 try{
  const stage=join(temporary,'application');
  stageNativeServer(resolve('.'),stage,{finalWorld:true,populationMode});
  // Import the staged TS dependency closure, not repository classes pointed at
  // source data. Constructor reads only files inside this release directory.
  const {FinalWorld:PackagedWorld}=await import(pathToFileURL(join(stage,'src/world/final-world.ts')));
  const actual=new PackagedWorld(join(stage,'world-final'),true,{populationMode});
  const expected=new FinalWorld(undefined,true,{populationMode});
  assert.equal(actual.mapVersion,expected.mapVersion);
  assert.deepEqual(actual.slots,expected.slots);
  assert.deepEqual(actual.services,expected.services);
  assert.deepEqual(Object.keys(actual.spaces),['surface','mine','great_cave']);
  for(const id of Object.keys(expected.spaces)){
   assert.deepEqual(actual.spaces[id].terrain.heights,expected.spaces[id].terrain.heights,`${id} floor`);
   assert.deepEqual(actual.spaces[id].collision.manifest(),expected.spaces[id].collision.manifest(),`${id} collision layers`);
   assert.deepEqual(actual.spaces[id].terrain.surfaces,expected.spaces[id].terrain.surfaces,`${id} supports`);
  }
  const files=readdirSync(join(stage,'world-final'),{recursive:true,withFileTypes:true}).filter(e=>e.isFile());
  assert.ok(files.length>0);
  assert.ok(files.every(e=>['.json','.f32'].includes(extname(e.name))),'Server package contains data, not GLBs/editor assets');
 }finally{
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+sep));
  rmSync(temporary,{recursive:true,force:true});
 }
});
