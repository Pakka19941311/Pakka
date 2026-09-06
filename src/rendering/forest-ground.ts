import { MaterialPluginBase, PBRMaterial, Texture } from '@babylonjs/core';
import type { Scene, UniformBuffer } from '@babylonjs/core';

const SURFACES=['forest_ground_04','brown_mud','mud_forest','roots','brown_mud_03'];
/** World-space blending keeps the surface continuous across terrain triangles.
 * Normal RGB + roughness A uses ten samplers for five complete PBR surfaces. */
class ForestGroundBlend extends MaterialPluginBase {
  private readonly maps:Texture[];
  constructor(material:PBRMaterial,scene:Scene){
    super(material,'ForestGroundBlend',200,{},true,true);
    this.maps=SURFACES.flatMap(name=>['diff.jpg','normal-roughness.png'].map(file=>{
      const texture=new Texture(`/assets/world/${name}/${file}`,scene,false,false);
      texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=8;
      texture.gammaSpace=file==='diff.jpg';return texture;
    }));
  }
  override getSamplers(samplers:string[]):void{for(let i=0;i<10;i++)samplers.push(`forestMap${i}`);}
  override isReadyForSubMesh():boolean{return this.maps.every(t=>t.isReady());}
  override bindForSubMesh(buffer:UniformBuffer):void{this.maps.forEach((texture,i)=>buffer.setTexture(`forestMap${i}`,texture));}
  override getCustomCode(type:string){
    if(type!=='fragment')return null;
    const declarations=Array.from({length:10},(_,i)=>`uniform sampler2D forestMap${i};`).join('\n');
    const definitions=`${declarations}
      vec4 forestWeights(vec2 p) {
        float woodland=smoothstep(30.0,75.0,p.x);
        float rootPatch=woodland*smoothstep(.5,.9,sin(p.x*.19)*cos(p.y*.16)*.5+.5);
        float damp=smoothstep(.2,.75,sin(p.x*.057+1.2)*cos(p.y*.063)*.5+.5);
        float fen=1.0-smoothstep(8.0,28.0,length(p-vec2(111.0,12.0)));
        return vec4((1.0-woodland)*damp*.5,woodland*.65,rootPatch*.65,fen*.85);
      }
      vec4 forestSample(vec2 p,bool normalMap) {
        vec4 w=forestWeights(p);float sum=w.x+w.y+w.z+w.w;
        w/=max(1.0,sum);float base=max(0.0,1.0-dot(w,vec4(1.0)));
        vec2 uv=p/3.2;
        if(normalMap) return texture2D(forestMap1,uv)*base + texture2D(forestMap3,p/3.0)*w.x + texture2D(forestMap5,p/3.4)*w.y + texture2D(forestMap7,p/3.0)*w.z + texture2D(forestMap9,p/3.0)*w.w;
        vec4 color=texture2D(forestMap0,uv)*base + texture2D(forestMap2,p/3.0)*w.x + texture2D(forestMap4,p/3.4)*w.y + texture2D(forestMap6,p/3.0)*w.z + texture2D(forestMap8,p/3.0)*w.w;
        color.rgb*=.94+.06*sin(p.x*.17+sin(p.y*.08))*cos(p.y*.15);
        return color;
      }`;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:definitions,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS:`surfaceAlbedo=toLinearSpace(forestSample(vPositionW.xz,false).rgb);
        vec3 forestNormal=forestSample(vPositionW.xz,true).rgb*2.0-1.0;
        vec3 forestTangent=normalize(vec3(normalW.y,-normalW.x,0.0));
        vec3 forestBitangent=normalize(cross(forestTangent,normalW));
        normalW=normalize(normalW*max(.2,forestNormal.z)+forestTangent*forestNormal.x*.6+forestBitangent*forestNormal.y*.6);`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'metallicRoughness=vec2(0.0,clamp(forestSample(vPositionW.xz,true).a,.28,.98));',
    };
  }
}
export function createForestGround(scene:Scene):PBRMaterial{
  const material=new PBRMaterial('approved-forest-ground',scene);material.metallic=0;material.roughness=.9;
  new ForestGroundBlend(material,scene);return material;
}
