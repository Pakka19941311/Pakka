/** Validate actual exported bytes, bounds and terrain, without mutating a world. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld} from '../../src/world/final-world.ts';
const root='godot-pc/world-final/nature/p2-sample-v3/',out='art/p2-nature-sample-v3/';
const json=p=>JSON.parse(readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=json(root+'manifest.json'),world=new FinalWorld(undefined,true,{populationMode:'starter-v3'}),checks=[],bounds=[];
const check=(name,pass,evidence)=>checks.push({name,pass,evidence});
let triangles=0,groundVertices=0,maxTerrainError=0;
function transform(p,node){
 if(node.matrix){const m=node.matrix;return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
 const s=node.scale??[1,1,1],t=node.translation??[0,0,0],[x,y,z,w]=node.rotation??[0,0,0,1];p=p.map((v,i)=>v*s[i]);
 const tx=2*(y*p[2]-z*p[1]),ty=2*(z*p[0]-x*p[2]),tz=2*(x*p[1]-y*p[0]);
 return [p[0]+w*tx+y*tz-z*ty+t[0],p[1]+w*ty+z*tx-x*tz+t[1],p[2]+w*tz+x*ty-y*tx+t[2]];
}
for(const entry of manifest.chunks){
 const bytes=readFileSync(root+entry.path),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),binary=bytes.subarray(28+length);
 check(entry.path+' bytes/hash',bytes.length===entry.bytes&&sha(bytes)===entry.sha256&&bytes.readUInt32LE(8)===bytes.length,{bytes:bytes.length});
 check(entry.path+' environment only',!doc.skins?.length&&!doc.animations?.length&&!doc.cameras?.length&&!doc.nodes.some(n=>/FK_|Hero|Knight|QA_|Collision/i.test(n.name??'')));
 const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 for(const node of doc.nodes){
  if(node.mesh===undefined)continue;
  for(const primitive of doc.meshes[node.mesh].primitives){
   if(primitive.indices!==undefined)triangles+=doc.accessors[primitive.indices].count/3;
   const a=doc.accessors[primitive.attributes.POSITION],view=doc.bufferViews[a.bufferView],start=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??12;
   for(let i=0;i<a.count;i++){
    const p=transform([0,1,2].map(k=>binary.readFloatLE(start+i*stride+k*4)),node);
    p.forEach((v,k)=>{low[k]=Math.min(low[k],v);high[k]=Math.max(high[k],v);});
    if(entry.kind==='ground'){groundVertices++;maxTerrainError=Math.max(maxTerrainError,Math.abs(p[1]-world.spaces.surface.terrain.heightAt(p[0],-p[2])-.008));}
   }
   if(entry.kind==='ground')check(entry.path+' material masks retained',primitive.attributes.COLOR_0!==undefined);
  }
 }
 const b=manifest.regions[entry.region];
 check(entry.path+' finite local AABB',[...low,...high].every(Number.isFinite)&&low[0]>=b[0]-15&&high[0]<=b[2]+15&&low[2]>=b[1]-15&&high[2]<=b[3]+15&&high[1]-low[1]<60,{low,high,cell:entry.cell});bounds.push({path:entry.path,low,high});
 for(const image of doc.images??[])check(entry.path+' shared image '+image.uri,image.uri?.startsWith('textures/')&&!image.uri.includes('..')&&manifest.sharedOriginalImages[image.uri]?.sha256===sha(readFileSync(root+image.uri)));
}
check('all ground vertices follow real terrain +8mm',groundVertices>37000&&maxTerrainError<.00002,{vertices:groundVertices,maxErrorM:maxTerrainError});
check('runtime collision equals authored measured obstacles',JSON.stringify(json(root+'collision.json').obstacles)===JSON.stringify(json(out+'candidate-placements.json').obstacles));
check('no source master exceeds 100MB',readFileSync(manifest.sourceMaster).length<100_000_000);
check('source master SHA',sha(readFileSync(manifest.sourceMaster))===manifest.sourceMasterSha256);
const failed=checks.filter(c=>!c.pass).length;
writeFileSync(out+'runtime-audit.json',JSON.stringify({checks:checks.length,failed,triangles,groundVertices,maxTerrainErrorM:maxTerrainError,bounds,results:checks},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,failed,triangles,groundVertices,maxTerrainErrorM:maxTerrainError}));if(failed)process.exitCode=1;
