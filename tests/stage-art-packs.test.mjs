import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {stageArtPacks,selectProfileArtPacks,stageGameplayCredits} from '../scripts/stage-art-packs.mjs';
const archiveManifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_STANDALONE_ART_PACKS.json','utf8'));
const profiles=JSON.parse(readFileSync('godot-pc/world-expansion-v3/actors/profiles.json','utf8'));
const manifest=selectProfileArtPacks(archiveManifest,profiles);
function temporary(t){
  const folder=mkdtempSync(join(tmpdir(),'varendor-art-pack-'));
  t.after(()=>{assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));rmSync(folder,{recursive:true,force:true});});
  return folder;
}
test('release contains exact standalone adapted art and complete license files',t=>{
  const out=temporary(t),result=stageArtPacks('.',out,manifest);
  assert.deepEqual(manifest.packs.map(pack=>pack.id),['boar','roach-six']);
  assert.equal(result.files,manifest.packs.reduce((n,p)=>n+p.files.length,0));
  for(const pack of manifest.packs)for(const file of pack.files)
    assert.deepEqual(readFileSync(join(out,pack.destination_directory,file.destination)),readFileSync(file.source));
  assert.deepEqual(JSON.parse(readFileSync(join(out,'licenses/standalone-art-packs.json'),'utf8')),manifest);
  assert.equal(existsSync(join(out,'art/roach-cc-by-sa-3.0')),false);
});
test('canonical share-alike model cannot ship without its matching pack',()=>{
  const incomplete=structuredClone(archiveManifest);
  incomplete.packs=incomplete.packs.filter(pack=>pack.id!=='roach-six');
  assert.throws(()=>selectProfileArtPacks(incomplete,profiles),/missing-canonical-sharealike-pack:MOB-05/);
});
test('active actor, cloak, NPC and nature notices are readable outside the PCK',t=>{
  const out=temporary(t),result=stageGameplayCredits('.',out,{p2:true});
  assert.equal(result.files,13);
  for(const [source,target] of [
    ['godot-pc/world-expansion-v3/actors/CREDITS.md','licenses/godot-pc/world-expansion-v3/actors/CREDITS.md'],
    ['art/cloaks-v3/CREDITS.md','licenses/art/cloaks-v3/CREDITS.md'],
    ['art/forgotten-knight/LICENSES.md','licenses/art/forgotten-knight/LICENSES.md'],
    ['godot-pc/world-expansion-v3/city/CREDITS.md','licenses/city/CREDITS.md'],
    ['godot-pc/world-expansion-v3/city/motion/CREDITS.md','licenses/city/motion/CREDITS.md'],
    ['art/p2-nature-sample-v3/CREDITS.md','licenses/nature/CREDITS.md'],
    ['godot-pc/world-expansion-v3/city/licenses/CC0-1.0.txt','licenses/nature/CC0-1.0.txt'],
  ])assert.deepEqual(readFileSync(join(out,target)),readFileSync(source));
});
test('changed art fails before copying; paths cannot escape the release',t=>{
  const out=temporary(t),changed=structuredClone(manifest);
  changed.packs.at(-1).files.at(-1).sha256='0'.repeat(64);
  assert.throws(()=>stageArtPacks('.',out,changed),/content-differs/);
  assert.equal(existsSync(join(out,manifest.packs[0].destination_directory)),false);
  const escaped=structuredClone(manifest);escaped.packs[0].destination_directory='../escape';
  assert.throws(()=>stageArtPacks('.',out,escaped),/escapes-root/);
});
