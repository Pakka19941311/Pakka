import type { CollisionWorld } from './collision-world.ts';

export const CASTLE_MODELS = ['castle_arch','castle_wall','castle_tower','castle_keep','castle_spire','castle_turret'] as const;
export type CastleModel = typeof CASTLE_MODELS[number];
export type ArchSlab = Readonly<{left:number;right:number;bottom:number;top:number}>;

/** Profile comes from the reviewed mesh, clipped into vertical slabs during
 * asset preparation. It is independent of camera distance and display LOD. */
export function registerCastleCollider(world:CollisionWorld,model:CastleModel,x:number,z:number,
  size:Readonly<{x:number;y:number;z:number}>,rotation:number,bottom:number,profile:readonly ArchSlab[]=[]):void {
  if(model==='castle_arch'){
    if(profile.length!==24)throw Error('Missing reviewed castle arch profile');
    for(const slab of profile){
      const offset=(slab.left+slab.right)*.5*size.x;
      const cx=x+Math.cos(rotation)*offset,cz=z-Math.sin(rotation)*offset;
      // A tiny overlap closes floating-point seams between adjacent slabs.
      const halfX=(slab.right-slab.left)*.5*size.x+.001;
      const low=bottom+slab.bottom*size.y,high=bottom+slab.top*size.y;
      if(slab.bottom*size.y<2.1)world.addBox(cx,cz,halfX,size.z*.5,rotation,low,high);
      else world.addOverhang(cx,cz,halfX,size.z*.5,rotation,low,high);
    }
  }else if(model==='castle_tower'||model==='castle_spire'||model==='castle_turret'){
    world.addCircle(x,z,Math.max(size.x,size.z)*.5,bottom,bottom+size.y);
  }else world.addBox(x,z,size.x*.5,size.z*.5,rotation,bottom,bottom+size.y);
}
