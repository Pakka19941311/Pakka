import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {stageArtPacks} from '../scripts/stage-art-packs.mjs';
const manifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_STANDALONE_ART_PACKS.json','utf8'));
function temporary(t){
  const folder=mkdtempSync(join(tmpdir(),'varendor-art-pack-'));
  t.after(()=>{assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));rmSync(folder,{recursive:true,force:true});});
  return folder;
}
test('release contains exact standalone adapted art and complete license files',t=>{
  const out=temporary(t),result=stageArtPacks('.',out,manifest);
  assert.equal(result.files,manifest.packs.reduce((n,p)=>n+p.files.length,0));
  for(const pack of manifest.packs)for(const file of pack.files)
    assert.deepEqual(readFileSync(join(out,pack.destination_directory,file.destination)),readFileSync(file.source));
  assert.deepEqual(JSON.parse(readFileSync(join(out,'licenses/standalone-art-packs.json'),'utf8')),manifest);
});
test('changed art fails before copying; paths cannot escape the release',t=>{
  const out=temporary(t),changed=structuredClone(manifest);
  changed.packs.at(-1).files.at(-1).sha256='0'.repeat(64);
  assert.throws(()=>stageArtPacks('.',out,changed),/content-differs/);
  assert.equal(existsSync(join(out,manifest.packs[0].destination_directory)),false);
  const escaped=structuredClone(manifest);escaped.packs[0].destination_directory='../escape';
  assert.throws(()=>stageArtPacks('.',out,escaped),/escapes-root/);
});
