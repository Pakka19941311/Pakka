import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {HERO_RADIUS} from './spatial.mjs';

/** Conservative collision-checked flood from the actual player/portal entry.
 * Every edge uses the same .35 m segment sampler as live navigation.
 * A road vertex or room centre is never accepted as a disconnected extra root.
 */
export function buildAccessGraph(world,spaceId,{step=spaceId==='surface'?4:2}={}) {
 const space=world.spaces[spaceId],b=space.bounds,collision=space.collision;
 const width=Math.floor((b[2]-b[0])/step)+1,depth=Math.floor((b[3]-b[1])/step)+1;
 const parent=new Int32Array(width*depth).fill(-2);
 const free=new Int8Array(width*depth);
 const point=id=>({x:b[0]+id%width*step,z:b[1]+Math.floor(id/width)*step});
 const rawEntry=spaceId==='surface'?world.start:{x:space.definition.entry[0],z:-space.definition.entry[2]};
 const start=collision.findNearestFree(rawEntry,HERO_RADIUS);
 const nearIds=p=>{
  const gx=Math.round((p.x-b[0])/step),gz=Math.round((p.z-b[1])/step),out=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const x=gx+dx,z=gz+dz;if(x>=0&&x<width&&z>=0&&z<depth)out.push(z*width+x);
  }
  return out.sort((a,b)=>Math.hypot(point(a).x-p.x,point(a).z-p.z)-Math.hypot(point(b).x-p.x,point(b).z-p.z));
 };
 const isFree=id=>{
  if(!free[id])free[id]=collision.isBlocked(point(id),HERO_RADIUS)?-1:1;
  return free[id]===1;
 };
 const root=nearIds(start).find(id=>isFree(id)&&pathSegmentIsClear(collision,start,point(id),HERO_RADIUS));
 if(root===undefined)throw Error('No connected entry grid for '+spaceId);
 parent[root]=-1;
 const queue=new Int32Array(width*depth);queue[0]=root;let tail=1;
 for(let head=0;head<tail;head++){
  const id=queue[head],x=id%width,z=Math.floor(id/width),p=point(id);
  const neighbors=[x>0?id-1:-1,x<width-1?id+1:-1,z>0?id-width:-1,z<depth-1?id+width:-1];
  for(const n of neighbors){
   if(n<0||parent[n]!==-2||!isFree(n))continue;
   if(!pathSegmentIsClear(collision,p,point(n),HERO_RADIUS))continue;
   parent[n]=id;queue[tail++]=n;
  }
 }
 const nodeFor=p=>nearIds(p).find(id=>parent[id]!==-2&&pathSegmentIsClear(collision,p,point(id),HERO_RADIUS));
 const pathTo=p=>{
  let id=nodeFor(p);if(id===undefined)return null;
  const reversed=[p];while(id>=0){reversed.push(point(id));id=parent[id];}
  reversed.push(start);const all=reversed.reverse(),result=[all[0]];
  // Merge only collinear forward edges. Avoid the aggressive smoothing that
  // can cross a collision corner or a terrain discontinuity.
  for(let i=1;i<all.length-1;i++){
   const a=result.at(-1),b=all[i],c=all[i+1];
   if(Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))<1e-8&&
      (b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z)>0&&
      pathSegmentIsClear(collision,a,c,HERO_RADIUS))continue;
   result.push(b);
  }
  result.push(all.at(-1));return result;
 };
 return {spaceId,step,start,reachableCount:tail,nodeFor,pathTo,parent,point};
}
