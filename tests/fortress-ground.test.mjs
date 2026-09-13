import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('exported courtyard road mask and UVs agree at every shared coordinate',()=>{
 const raw=readFileSync('godot-pc/world-final/castle/courtyard-p2.glb'),length=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+length)),binary=raw.subarray(28+length);
 const mesh=doc.meshes.find(m=>m.name==='F3_ground_continuous');assert.ok(mesh);
 const access=name=>{const a=doc.accessors[mesh.primitives[0].attributes[name]],v=doc.bufferViews[a.bufferView];assert.equal(v.byteStride,undefined);return {count:a.count,offset:(v.byteOffset??0)+(a.byteOffset??0)};};
 const pos=access('POSITION'),uv=access('TEXCOORD_0'),color=access('COLOR_0'),shared=new Map();let duplicateCount=0;
 assert.equal(pos.count,color.count);assert.equal(pos.count,uv.count);
 for(let i=0;i<pos.count;i++){
  const x=binary.readFloatLE(pos.offset+i*12),z=binary.readFloatLE(pos.offset+i*12+8),key=x+':'+z;
  assert.equal(binary.readFloatLE(uv.offset+i*8),x/4);assert.equal(binary.readFloatLE(uv.offset+i*8+4),z/4);
  const rgba=Array.from({length:4},(_,k)=>binary.readUInt16LE(color.offset+i*8+k*2));
  assert.equal(rgba[3],65535);assert.equal(rgba[0],rgba[1]);assert.equal(rgba[1],rgba[2]);
  if(shared.has(key)){assert.equal(rgba[0],shared.get(key));duplicateCount++;}else shared.set(key,rgba[0]);
 }
 assert.ok(duplicateCount>40000);assert.ok([...shared.values()].includes(0));assert.ok([...shared.values()].includes(65535));
});
