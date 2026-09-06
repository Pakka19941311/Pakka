import { SceneLoader, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Scene } from '@babylonjs/core';
import { CASTLE_MODELS } from '../world/castle-collision';
import type { CastleModel, ArchSlab } from '../world/castle-collision';

export class CastleAssets {
  private readonly scene:Scene;
  private readonly assets=new Map<string,AssetContainer>();
  private readonly instances:Array<{root:TransformNode;near:TransformNode;far:TransformNode;x:number;z:number;farActive:boolean}>=[];
  private profile:readonly ArchSlab[]=[];
  constructor(scene:Scene){this.scene=scene;}
  get archProfile():readonly ArchSlab[]{return this.profile;}
  async load(progress:()=>void):Promise<void>{
    const response=await fetch('/assets/world/castle_pack/prepared-castle.json');
    if(!response.ok)throw Error('Castle asset manifest is unavailable');
    const manifest=await response.json() as {modules:Array<{name:string;collision_profile?:ArchSlab[]}>};
    const profile=manifest.modules?.find(m=>m.name==='castle_arch')?.collision_profile;
    if(!profile||profile.length!==24||profile.some((s,i)=>
      ![s.left,s.right,s.bottom,s.top].every(Number.isFinite)||s.right<=s.left||s.bottom<0||s.top>1.001||s.top<s.bottom
      ||Math.abs(s.left-(-.5+i/24))>1e-5||Math.abs(s.right-(-.5+(i+1)/24))>1e-5))throw Error('Invalid castle arch profile');
    this.profile=profile;
    const jobs=CASTLE_MODELS.flatMap(model=>[0,1].map(lod=>async()=>{
      const key=`${model}_lod${lod}`;
      this.assets.set(key,await SceneLoader.LoadAssetContainerAsync('/assets/world/castle_pack/',`${key}.glb`,this.scene));
      progress();
    }));
    for(let index=0;index<jobs.length;index+=4)await Promise.all(jobs.slice(index,index+4).map(job=>job()));
  }
  place(model:CastleModel,x:number,y:number,z:number,height:number,rotation:number,
    footprint:Readonly<{width?:number;depth?:number}>,onMesh:(mesh:AbstractMesh)=>void){
    const root=new TransformNode(`approved-${model}-${this.instances.length}`,this.scene);
    root.metadata={castleModel:model};
    const make=(lod:number)=>{
      const container=this.assets.get(`${model}_lod${lod}`);
      if(!container)throw Error(`Missing castle module: ${model}/${lod}`);
      const entries=container.instantiateModelsToScene(n=>`${root.name}-${lod}-${n}`,false,{doNotInstantiate:false});
      const group=new TransformNode(`${root.name}-lod${lod}`,this.scene);group.parent=root;
      for(const node of entries.rootNodes)node.parent=group;
      for(const mesh of group.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;onMesh(mesh);}
      return group;
    };
    const near=make(0),far=make(1);
    near.computeWorldMatrix(true);near.getChildMeshes().forEach(m=>m.computeWorldMatrix(true));
    const bounds=near.getHierarchyBoundingVectors(true),basis=bounds.max.subtract(bounds.min);
    if(Math.min(basis.x,basis.y,basis.z)<=0)throw Error(`Empty castle geometry: ${model}`);
    const scale=height/basis.y;
    const size={x:footprint.width??basis.x*scale,y:height,z:footprint.depth??basis.z*scale};
    root.scaling.set(size.x/basis.x,scale,size.z/basis.z);
    root.position.set(x,y-bounds.min.y*scale,z);root.rotation.y=rotation;
    far.setEnabled(false);
    this.instances.push({root,near,far,x,z,farActive:false});
    return {root,size};
  }
  update(x:number,z:number,lowQuality:boolean):void{
    for(const instance of this.instances){
      const far=Math.hypot(instance.x-x,instance.z-z)>(lowQuality?28:48)+(instance.farActive?-4:4);
      if(far!==instance.farActive){instance.farActive=far;instance.near.setEnabled(!far);instance.far.setEnabled(far);}
    }
  }
  describe(){return {templates:this.assets.size,instances:this.instances.length,visible:this.instances.filter(i=>i.root.isEnabled()).length};}
}
