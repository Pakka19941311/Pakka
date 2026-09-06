// UNVERIFIED DRAFT: original cliff binary is unavailable; no assets were rebuilt.
// This file is not part of the build or automatic asset preparation.
// From the repository root, with meshoptimizer@0.25.0 available:
// node docs/drafts/prepare-cliff-assets.mjs /path/to/approved-source-root
// Run changed-cliff render and topology checks before promoting the output.
// Source UV seams must survive simplification. Reuse source vertex attributes;
// never assign a new vertex the UV of a nearby vertex on another texture island.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {MeshoptSimplifier} from 'meshoptimizer';

const source=path.resolve(process.argv[2]);
const name='coastal_cliff_04';
const receipts=JSON.parse(await readFile('docs/assets/world-source-manifest.json','utf8')).files;
const verified=async relative=>{
  const receipt=receipts.find(item=>item.path===relative);
  const bytes=await readFile(path.join(source,relative));
  assert.equal(bytes.length,receipt.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  return bytes;
};
const original=JSON.parse(await verified(`${name}/${name}_1k.gltf`));
const sourceBytes=await verified(`${name}/${name}.bin`);
function values(index){
  const a=original.accessors[index],view=original.bufferViews[a.bufferView];
  const width={SCALAR:1,VEC2:2,VEC3:3}[a.type];
  const Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];
  assert.ok(!view.byteStride||view.byteStride===width*Type.BYTES_PER_ELEMENT);
  return new Type(sourceBytes.buffer,sourceBytes.byteOffset+(view.byteOffset??0)+(a.byteOffset??0),a.count*width);
}
const primitive=original.meshes[0].primitives[0];
assert.equal(original.meshes[0].primitives.length,1);
const positions=values(primitive.attributes.POSITION),normals=values(primitive.attributes.NORMAL),uvs=values(primitive.attributes.TEXCOORD_0);
const indices=new Uint32Array(values(primitive.indices));
const attributes=new Float32Array(positions.length/3*5);
for(let i=0;i<positions.length/3;i++)attributes.set([normals[i*3],normals[i*3+1],normals[i*3+2],uvs[i*2],uvs[i*2+1]],i*5);
await MeshoptSimplifier.ready;
const manifestPath='public/assets/world/prepared-assets.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
for(const lod of [0,1]){
  const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,5,[.2,.2,.2,2,2],null,
    (lod?6000:24000)*3,lod?.015:.005,['LockBorder']);
  const [remap,count]=MeshoptSimplifier.compactMesh(reduced);
  const compact=(data,width)=>{
    const result=new Float32Array(count*width);
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)result.set(data.subarray(i*width,i*width+width),remap[i]*width);
    return result;
  };
  const filename=`public/assets/world/${name}/${name}_0_lod${lod}.glb`;
  const old=await readFile(filename),jsonSize=old.readUInt32LE(12);
  const doc=JSON.parse(old.toString('utf8',20,20+jsonSize));
  doc.accessors=[];doc.bufferViews=[];
  const chunks=[];let length=0;
  const add=(data,type,component=5126)=>{
    const width={SCALAR:1,VEC2:2,VEC3:3}[type];
    doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.byteLength});
    chunks.push(Buffer.from(data.buffer,data.byteOffset,data.byteLength));length+=data.byteLength;
    const accessor={bufferView:doc.bufferViews.length-1,componentType:component,count:data.length/width,type};
    if(type==='VEC3'){
      accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<data.length;i++){
        const k=i%3;accessor.min[k]=Math.min(accessor.min[k],data[i]);accessor.max[k]=Math.max(accessor.max[k],data[i]);
      }
    }
    doc.accessors.push(accessor);return doc.accessors.length-1;
  };
  doc.meshes[0].primitives=[{material:0,attributes:{POSITION:add(compact(positions,3),'VEC3'),
    NORMAL:add(compact(normals,3),'VEC3'),TEXCOORD_0:add(compact(uvs,2),'VEC2')},indices:add(reduced,'SCALAR',5125)}];
  doc.buffers=[{byteLength:length}];
  let metadata=Buffer.from(JSON.stringify(doc));metadata=Buffer.concat([metadata,Buffer.alloc((-metadata.length)&3,32)]);
  const binary=Buffer.concat(chunks),header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+metadata.length+binary.length,8);
  header.writeUInt32LE(metadata.length,12);header.write('JSON',16);
  binaryHeader.writeUInt32LE(binary.length);binaryHeader.write('BIN\0',4);
  const bytes=Buffer.concat([header,metadata,binaryHeader,binary]);await writeFile(filename,bytes);
  const entry=manifest.find(item=>item.path===filename.slice('public/'.length));
  Object.assign(entry,{triangles:reduced.length/3,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    simplification:{tool:'meshoptimizer 0.25.0',preservesSourceUV:true,relativeError:error}});
  console.log(filename,entry.triangles,'triangles',bytes.length,'bytes','error',error);
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
