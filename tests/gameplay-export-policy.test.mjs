import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {EXCLUDED_ACTOR_PREFIXES,isExcludedActorPath,updateGameplayExportFilters} from '../scripts/world_final/gameplay-export-policy.mjs';

test('every export preset excludes staged art while retaining custom settings and active JSON',()=>{
  const original=readFileSync('godot-pc/export_presets.cfg','utf8');
  const raw=['generated/game.json','world-expansion-v3/actors/profiles.json',
    'world-final/nature/p2-sample-v3/collision.json',
    'world-expansion-v3/actors/cohort-06-10/exile/CANDIDATE.json',
    'world-expansion-v3/actors/alternatives/roach/profile.json'];
  const updated=updateGameplayExportFilters(original,raw);
  const eraseFilters=text=>text.replace(/^(include|exclude)_filter="[^"]*"/gm,'');
  assert.equal(eraseFilters(updated),eraseFilters(original));
  assert.equal(updateGameplayExportFilters(updated,raw),updated);
  const includes=[...updated.matchAll(/^include_filter="([^"]*)"/gm)];
  const excludes=[...updated.matchAll(/^exclude_filter="([^"]*)"/gm)];
  assert.ok(includes.length>=2);assert.equal(includes.length,excludes.length);
  for(const [,list] of includes)assert.deepEqual(list.split(','),raw.slice(0,3).sort());
  const oldExcludes=[...original.matchAll(/^exclude_filter="([^"]*)"/gm)];
  for(let i=0;i<excludes.length;i++)for(const pattern of [
    ...oldExcludes[i][1].split(',').filter(Boolean),...EXCLUDED_ACTOR_PREFIXES.map(prefix=>prefix+'*'),
  ])assert.ok(excludes[i][1].split(',').includes(pattern));
});

test('retained scripts/scenes and canonical profiles do not reference excluded art',()=>{
  // Literal preload/load/ext_resource paths cover exported QA dependencies too.
  for(const entry of readdirSync('godot-pc',{recursive:true})){
    const file=entry.replaceAll('\\','/');
    if(file==='.godot'||file.startsWith('.godot/')||isExcludedActorPath(file)||! /\.(gd|tscn|tres|godot)$/.test(file)||!statSync('godot-pc/'+file).isFile())continue;
    for(const [,target] of readFileSync('godot-pc/'+file,'utf8').matchAll(/["'](res:\/\/[^"'\r\n]+)["']/g))
      assert.equal(isExcludedActorPath(target),false,`${file} references excluded ${target}`);
  }
  const profiles=JSON.parse(readFileSync('godot-pc/world-expansion-v3/actors/profiles.json','utf8'));
  assert.deepEqual(Object.keys(profiles),['MOB-01','MOB-02','MOB-03','MOB-04','MOB-05']);
  for(const profile of Object.values(profiles)){
    assert.equal(isExcludedActorPath(profile.asset_path),false,profile.mob_id);
    assert.ok(existsSync('godot-pc/'+profile.asset_path.slice(6)),profile.asset_path);
  }
  for(const file of ['scripts/stage_acceptance.gd','scripts/p2_pursuit_acceptance.gd',
    'scripts/p2_nature_acceptance.gd','world-expansion-v3/city/motion/CREDITS.md',
    'world-final/nature/p2-sample-v3/nature_sample.gd']){
    assert.equal(isExcludedActorPath(file),false);assert.ok(existsSync('godot-pc/'+file));
  }
});
