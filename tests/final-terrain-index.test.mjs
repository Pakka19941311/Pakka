import test from 'node:test';
import assert from 'node:assert/strict';
import {FinalTerrain,FinalWorld} from '../src/world/final-world.ts';

function exhaustive(terrain,x,z){
 let y=terrain.heightAt(x,z);
 for(const s of terrain.surfaces){
  const dx=x-s.x,dz=-z-s.z,c=Math.cos(s.angle),sn=Math.sin(s.angle),lx=dx*c-dz*sn,lz=dx*sn+dz*c;
  if(Math.abs(lx)<=s.halfX&&Math.abs(lz)<=s.halfZ)y=Math.max(y,s.kind==='ramp_z'?s.high+(s.y-s.high)*(lz+s.halfZ)/(2*s.halfZ):s.y);
 }return y;
}
function check(terrain,points){for(const [x,z] of points)assert.equal(terrain.supportAt(x,z),exhaustive(terrain,x,z),`exact support at ${x},${z}`);}
function edgePoints(s){
 const c=Math.cos(s.angle),sn=Math.sin(s.angle),points=[];
 for(const epsilon of [-1e-8,0,1e-8])for(const u of [-1,0,1])for(const v of [-1,0,1]){
  const lx=u*(s.halfX+epsilon),lz=v*(s.halfZ+epsilon);
  points.push([s.x+lx*c+lz*sn,-(s.z-lx*sn+lz*c)]);
 }return points;
}
test('spatial supports exactly retain rotated ramp, overlapping deck and cell-edge results',()=>{
 const supports=[{kind:'ramp_z',x:32,z:-32,halfX:3,halfZ:7,angle:.71,y:1,high:5},
  {kind:'platform',x:32,z:-32,halfX:2,halfZ:2,angle:-.25,y:4},
  {kind:'platform',x:-32,z:64,halfX:32,halfZ:32,angle:0,y:8}];
 const terrain=new FinalTerrain({columns:1,rows:1,step:256,bounds:[-128,-128,128,128]},new Uint8Array(new Float32Array(4).buffer),supports);
 check(terrain,supports.flatMap(edgePoints));
 check(terrain,[-64,-32,0,32,64].flatMap(x=>[-64,-32,0,32,64].flatMap(z=>[-1e-8,0,1e-8].map(e=>[x+e,z+e]))));
});
test('all actual final-world support edges and seeded full-map points match exhaustive geometry',()=>{
 const world=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
 let seed=187;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(const space of Object.values(world.spaces)){
  const t=space.terrain,points=t.surfaces.flatMap(edgePoints),b=space.bounds;
  for(let i=0;i<3000;i++)points.push([b[0]+random()*(b[2]-b[0]),b[1]+random()*(b[3]-b[1])]);
  check(t,points);
 }
});
test('actual walkability and resolved motion agree with the former support implementation',()=>{
 const world=new FinalWorld(undefined,true,{populationMode:'starter-v3'}),space=world.spaces.surface,t=space.terrain;
 const indexed=t.supportAt.bind(t),points=t.surfaces.flatMap(s=>edgePoints(s).filter((_,i)=>i%4===0));
 for(const p of [[-567.461,448.444],[-136,-121],[-85.99,-212.45],[-280,-170],...points]){
  const start={x:p[0],z:p[1]},delta={x:.036,z:-.021};
  t.supportAt=indexed;const blocked=space.collision.walkable(start,.46),move=space.collision.resolve(start,delta,.46);
  t.supportAt=(x,z)=>exhaustive(t,x,z);
  assert.equal(space.collision.walkable(start,.46),blocked);
  assert.deepEqual(space.collision.resolve(start,delta,.46),move);
 }
 t.supportAt=indexed;
});
