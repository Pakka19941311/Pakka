import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

function glb(role) {
 const bytes=readFileSync(`godot-pc/world-expansion-v3/city/motion/assets/P2_${role}_motion.glb`);
 assert.equal(bytes.readUInt32LE(0),0x46546c67);
 const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
 const binary=bytes.subarray(28+length);
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 function accessor(index) {
  const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126,'animation/position floats');
  return Array.from({length:a.count},(_,i)=>Array.from({length:widths[a.type]},(_,j)=>binary.readFloatLE((view.byteOffset??0)+(a.byteOffset??0)+i*(view.byteStride??widths[a.type]*4)+j*4)));
 }
 return {gltf,accessor};
}

for(const role of ['guard','resident']) {
 test(`${role}: real MPFB skin and distinct five motion clips`,()=>{
  const {gltf:g,accessor:a}=glb(role);
  assert.ok(g.skins.length>0);
  assert.equal(new Set(g.skins.flatMap(s=>s.joints)).size,53);
  assert.deepEqual(g.animations.map(v=>v.name).sort(),['idle','talk','turn_left','turn_right','walk']);
  const duration={idle:4,talk:3.2,turn_left:1.2,turn_right:1.2,walk:role==='guard'?1.3:1.4};
  for(const clip of g.animations) {
   assert.ok(clip.channels.length>=53,'authored rig channels');
   for(const sampler of clip.samplers)assert.ok(Math.abs(a(sampler.input).at(-1)[0]-duration[clip.name])<1e-5);
   if(['idle','walk','talk'].includes(clip.name))for(const channel of clip.channels){
    const values=a(clip.samplers[channel.sampler].output),first=values[0],last=values.at(-1);
    const err=Math.max(...first.map((v,i)=>Math.abs(v-last[i])));
    const negErr=Math.max(...first.map((v,i)=>Math.abs(v+last[i])));
    assert.ok(Math.min(err,channel.target.path==='rotation'?negErr:Infinity)<.0001,`${clip.name} loop seam`);
   }
  }
  for(const mesh of g.meshes)for(const part of mesh.primitives)for(const p of a(part.attributes.POSITION))assert.ok(p.every(Number.isFinite));
  const names=g.nodes.map(n=>n.name??'');
  assert.ok(!names.some(n=>n==='Icosphere'||n.startsWith('FK_')),'no donor rig or helper objects');
  if(role==='guard')for(const name of ['P2_guard_helmet','P2_guard_sword','P2_guard_scabbard','P2_guard_strap_0','P2_guard_strap_1'])assert.ok(names.includes(name),name);
 });
 test(`${role}: baked stance agrees with measured travel and native rig`,()=>{
  const report=JSON.parse(readFileSync(`docs/world-expansion-v3/npc-motion-evidence/${role}-motion.json`));
  assert.equal(createHash('sha256').update(readFileSync(`godot-pc/world-expansion-v3/city/motion/assets/P2_${role}_motion.glb`)).digest('hex'),report.sha256,'evidence belongs to this exact GLB');
  assert.equal(report.motionAudit.passed,true);
  assert.ok(report.motionAudit.stanceSamples.length>=20);
  assert.ok(report.motionAudit.maxStanceStepSlipM<.002);
  assert.ok(report.motionAudit.maxBoneScaleDeviation<.001);
  assert.ok(report.bounds[0][2]>-.001,'soles at the ground');
  const native=JSON.parse(readFileSync('docs/world-expansion-v3/npc-motion-evidence/NPC_MOTION_QA.json'));
  for(const key of ['53_bones','five_clips','planted_foot_samples','root_speed','no_stance_slide','turn_planted_foot'])assert.equal(native.checks[role+'_'+key],true,key);
  const process=JSON.parse(readFileSync('docs/world-expansion-v3/npc-motion-evidence/native-result.json'));
  assert.equal(process.operation_completed,true);assert.equal(process.timed_out,false);assert.equal(process.crash_detected,false);
 });
}
