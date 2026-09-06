import { SceneLoader, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Scene } from '@babylonjs/core';

export const ENVIRONMENT_MODELS = {pine_tree_01:3,fern_02:4,shrub_04:1,rock_moss_set_01:6,coastal_cliff_04:1} as const;
export type EnvironmentModel = keyof typeof ENVIRONMENT_MODELS;

/** Prepared source variants share geometry/materials. Both LODs use the same
 * source-space normalization, so changing distance does not move their feet. */
export class EnvironmentAssets {
  private readonly assets=new Map<string,AssetContainer>();
  private readonly instances: Array<{root:TransformNode;near:TransformNode;far:TransformNode;x:number;z:number;low:boolean;plant:boolean}>=[];
  private readonly scene: Scene;
  constructor(scene:Scene){this.scene=scene;}
  async load(progress:(name:string)=>void):Promise<void>{
    const jobs:Array<()=>Promise<void>>=[];
    for(const [name,variants] of Object.entries(ENVIRONMENT_MODELS))for(let variant=0;variant<variants;variant++)for(let lod=0;lod<2;lod++){
      const key=`${name}_${variant}_lod${lod}`;
      jobs.push(async()=>{const container=await SceneLoader.LoadAssetContainerAsync(`/assets/world/${name}/`,`${key}.glb`,this.scene);this.assets.set(key,container);progress(name);});
    }
    // Avoid decompressing every source simultaneously on a phone or a modest PC.
    for(let index=0;index<jobs.length;index+=4)await Promise.all(jobs.slice(index,index+4).map(job=>job()));
  }
  place(name:EnvironmentModel,variant:number,x:number,y:number,z:number,height:number,rotation:number,onMesh:(mesh:AbstractMesh)=>void):TransformNode{
    const root=new TransformNode(`environment-${name}-${this.instances.length}`,this.scene);
    const make=(lod:number)=>{
      const container=this.assets.get(`${name}_${variant%ENVIRONMENT_MODELS[name]}_lod${lod}`);
      if(!container)throw Error(`Missing environment: ${name}/${variant}/${lod}`);
      const instance=container.instantiateModelsToScene(n=>`${root.name}-${lod}-${n}`,false,{doNotInstantiate:false});
      const group=new TransformNode(`${root.name}-lod${lod}`,this.scene);
      for(const n of instance.rootNodes)n.parent=group;
      group.parent=root;
      for(const mesh of group.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;onMesh(mesh);}
      return group;
    };
    const near=make(0);const far=make(1);
    near.computeWorldMatrix(true);near.getChildMeshes().forEach(m=>m.computeWorldMatrix(true));
    const bounds=near.getHierarchyBoundingVectors(true);
    const scale=height/Math.max(.01,bounds.max.y-bounds.min.y);
    root.scaling.setAll(scale);root.rotation.y=rotation;
    root.position.set(x,y-bounds.min.y*scale,z);
    far.setEnabled(false);
    this.instances.push({root,near,far,x,z,low:false,plant:name==='fern_02'||name==='shrub_04'});
    return root;
  }
  update(x:number,z:number,lowQuality:boolean):void{
    for(const instance of this.instances){
      const distance=Math.hypot(instance.x-x,instance.z-z);
      const low=distance>(instance.plant?16:lowQuality?24:38)+(instance.low?-3:3);
      if(low!==instance.low){instance.low=low;instance.near.setEnabled(!low);instance.far.setEnabled(low);}
      // Small undergrowth disappears before its texture becomes subpixel noise.
      if(instance.plant)instance.root.setEnabled(distance<(lowQuality?36:60));
    }
  }
  describe(){return {templates:this.assets.size,instances:this.instances.length,
    visible:this.instances.filter(i=>i.root.isEnabled()).length,
    lodNear:this.instances.filter(i=>!i.low&&i.root.isEnabled()).length,
    lodFar:this.instances.filter(i=>i.low&&i.root.isEnabled()).length};}
}
