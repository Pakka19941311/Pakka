import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';

function glb(path){
  const bytes=readFileSync(path);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const binStart=20+bytes.readUInt32LE(12)+8;
  assert.ok(json.buffers[0].byteLength<=bytes.length-binStart);
  for(const image of json.images??[]){
    if(image.uri)assert.ok(existsSync(resolve(dirname(path),image.uri)),image.uri);
    else assert.ok(json.bufferViews[image.bufferView]);
  }
  for(const animation of json.animations??[])for(const channel of animation.channels){
    assert.ok(json.nodes[channel.target.node]);
    assert.ok(animation.samplers[channel.sampler]);
  }
  return {json,bytes};
}

test('production slime has its own complete skinned artifact and six valid actions',()=>{
  const profiles=JSON.parse(readFileSync('godot-pc/world-expansion-v3/actors/profiles.json','utf8'));
  const profile=profiles['MOB-01'];
  const {json,bytes}=glb('godot-pc/'+profile.asset_path.replace('res://',''));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),profile.sha256);
  assert.equal(profile.author,'Varendor original asset');
  assert.equal(profile.source_url,null);
  assert.equal(json.skins[0].joints.length,10);
  assert.deepEqual(json.animations.map(a=>a.name).sort(),['attack','death','hit','idle','run','walk']);
  assert.equal(json.nodes.some(n=>/eye/i.test(n.name??'')),false);
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
    assert.ok(primitive.attributes.JOINTS_0!==undefined);
    assert.ok(primitive.attributes.WEIGHTS_0!==undefined);
    assert.ok(primitive.attributes.COLOR_0!==undefined);
  }
});

test('new NPC variants retain complete five-action skins and resolvable materials after intermediate relocation',()=>{
  for(const role of ['worker','woman']){
    const path=`godot-pc/world-expansion-v3/city/production/P2_${role}_motion.glb`;
    const {json,bytes}=glb(path);
    const manifest=JSON.parse(readFileSync(`art/city-production/${role}-motion.json`,'utf8'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
    assert.equal(json.skins[0].joints.length,53);
    assert.deepEqual(json.animations.map(a=>a.name).sort(),['idle','talk','turn_left','turn_right','walk']);
    assert.ok(json.images.length>=5);
    const importText=readFileSync(path+'.import','utf8');
    for(const match of importText.matchAll(/"res:\/\/([^"\n]+\.png)"/g))assert.ok(existsSync('godot-pc/'+match[1]),match[1]);
  }
});
