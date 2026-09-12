import {CAVE_BOSS_SLOT} from '../data/cave-boss.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {CollisionWorld} from './collision-world.ts';
import type {Obstacle,Point2,CollisionMove} from './collision-world.ts';
import type {TerrainPlatform} from './terrain-surface.ts';
import {SERVICES} from './territory.ts';
import {spaceOf} from './world-space.ts';
import type {SpaceId,SpatialPoint} from './world-space.ts';
import {selectP2Population} from './p2-population.ts';
import type {P2PopulationMode,P2PopulationPlan} from './p2-population.ts';
import {P2_L02_HUNTING_CONTOUR} from '../data/p2-habitat-layout.ts';

export type TerrainSupport = {heights:Float32Array;heightAt(x:number,z:number):number;supportAt(x:number,z:number):number;platformManifest():TerrainPlatform[]};
export type SpawnSlot = SpatialPoint & {uid:string;speciesId:string;locationId:string;subzoneId:string;groupId:string;boss:boolean;patrol:SpatialPoint[];aggroRadius:number;leashRadius:number;
 level?:number;canonicalMobId?:string;name?:string;balanceVersion?:string;bodyRadius?:number;
 behavior?:{stance:string;provocation:string;socialAggro:boolean}};
export type FinalWorldOptions={populationMode?:P2PopulationMode};
type Support = {kind:string;x:number;z:number;halfX:number;halfZ:number;angle:number;y:number;high?:number};
type IndexedSupport = {source:Support;cosine:number;sine:number};
export function inPolygon(x:number,z:number,polygon:number[][]):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function segmentGap(x:number,z:number,a:number[],b:number[]):number {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export class FinalTerrain implements TerrainSupport {
  readonly heights:Float32Array;
  readonly meta:any;
  readonly surfaces:Support[];
  private readonly supportCells=new Map<string,IndexedSupport[]>();
  private readonly supportCellSize=32;
  constructor(meta:any, bytes:Uint8Array,surfaces:Support[]=[]){
    this.meta=meta;this.surfaces=surfaces;
    this.heights=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if(this.heights.length!==(meta.columns+1)*(meta.rows+1))throw Error('final-height-size');
    // Static authored supports are indexed once. Keep source order in every
    // bucket and the exact local-space test below: this changes lookup cost,
    // never terrain heights, ramp interpolation or collision boundaries.
    for(const source of surfaces){
      const cosine=Math.cos(source.angle),sine=Math.sin(source.angle),entry={source,cosine,sine};
      const hx=Math.abs(cosine)*source.halfX+Math.abs(sine)*source.halfZ+1e-7;
      const hz=Math.abs(sine)*source.halfX+Math.abs(cosine)*source.halfZ+1e-7;
      for(let x=Math.floor((source.x-hx)/this.supportCellSize);x<=Math.floor((source.x+hx)/this.supportCellSize);x++){
        for(let z=Math.floor((source.z-hz)/this.supportCellSize);z<=Math.floor((source.z+hz)/this.supportCellSize);z++){
          const key=`${x}:${z}`,bucket=this.supportCells.get(key);
          if(bucket)bucket.push(entry);else this.supportCells.set(key,[entry]);
        }
      }
    }
  }
  heightAt(x:number,z:number):number {
    const {columns:c,rows:r,step}=this.meta,b=this.meta.bounds??[-800,-700,800,700];
    const gx=Math.max(0,Math.min(c,(x-b[0])/step)),gz=Math.max(0,Math.min(r,(-z-b[1])/step));
    const col=Math.min(c-1,Math.floor(gx)),row=Math.min(r-1,Math.floor(gz)),u=gx-col,v=gz-row,i=row*(c+1)+col;
    const a=this.heights[i],bb=this.heights[i+1],cc=this.heights[i+c+1],d=this.heights[i+c+2];
    return u>=v?a+u*(bb-a)+v*(d-bb):a+u*(d-cc)+v*(cc-a);
  }
  supportAt(x:number,z:number):number {
    let y=this.heightAt(x,z);
    const supports=this.supportCells.get(`${Math.floor(x/this.supportCellSize)}:${Math.floor(-z/this.supportCellSize)}`);
    for(const {source:s,cosine:c,sine:sn} of supports??[]){
      const dx=x-s.x,dz=-z-s.z,lx=dx*c-dz*sn,lz=dx*sn+dz*c;
      if(Math.abs(lx)<=s.halfX&&Math.abs(lz)<=s.halfZ)y=Math.max(y,s.kind==='ramp_z'?s.high!+(s.y-s.high!)*(lz+s.halfZ)/(2*s.halfZ):s.y);
    }return y;
  }
  platformManifest():TerrainPlatform[]{return [];}
}
/** Same authored walls/trees and terrain walkability rules as Godot.
 * Terrain rejection uses axis slides, never depenetrates across a cliff. */
export class FinalCollision extends CollisionWorld {
  private gridCache=new Map<string,boolean>();
  walkable:(p:Point2,radius:number)=>boolean=()=>true;
  override isBlocked(p:Point2,radius:number):boolean{
    const grid=Number.isInteger(p.x)&&Number.isInteger(p.z),key=grid?`${p.x}:${p.z}:${radius}`:'';
    if(grid&&this.gridCache.has(key))return this.gridCache.get(key)!;
    const blocked=!this.walkable(p,radius)||super.isBlocked(p,radius);
    if(grid)this.gridCache.set(key,blocked);
    return blocked;
  }
  override resolve(from:Point2,delta:Point2,radius:number):CollisionMove {
    let p={x:from.x,z:from.z},blocked=false;
    const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/Math.max(.1,radius*.5)));
    for(let i=0;i<steps;i++){
      const d={x:delta.x/steps,z:delta.z/steps},q={x:p.x+d.x,z:p.z+d.z};
      if(!this.walkable(q,radius)){
        blocked=true;
        for(const axis of [{x:d.x,z:0},{x:0,z:d.z}]){
          const n={x:p.x+axis.x,z:p.z+axis.z};
          if(!this.isBlocked(n,radius))p=n;
        }
      }else{
        const moved=super.resolve(p,d,radius);
        if(this.walkable(moved,radius))p={x:moved.x,z:moved.z};
        blocked ||= moved.blocked;
      }
    }return {...p,blocked};
  }
}
export type FinalSpace={id:SpaceId;terrain:FinalTerrain;collision:FinalCollision;bounds:number[];definition:any;mask?:Uint8Array};
export class FinalWorld {
  readonly root:string;
  readonly revision='world-final-gameplay-1';
  readonly layout:any;
  readonly spaces:Record<SpaceId,FinalSpace>;
  readonly services:Record<string,any>={};
  readonly start:SpatialPoint={x:-100,z:-190,spaceId:'surface'};
  readonly slots:SpawnSlot[];
  readonly slotById:Map<string,SpawnSlot>;
  readonly mapVersion:string;
  readonly populationMode:P2PopulationMode;
  readonly courtyardPath:string;
  readonly natureSamplePath:string|null;
  readonly populationPlan:P2PopulationPlan;
  readonly teleports:Record<string,SpatialPoint&{level:number;cost:number}>={
    'Гринфолл':{...this.start,level:1,cost:25},'Астерхолд':{x:-490,z:-356,spaceId:'surface',level:1,cost:0},
    'Чёрный лес':{x:-310,z:278,spaceId:'surface',level:10,cost:90},'Вход в шахту':{x:35,z:395,spaceId:'surface',level:10,cost:150},
  };
  constructor(root=resolve('godot-pc/world-final'),loadPopulation=true,options:FinalWorldOptions={}){
    this.root=root;
    this.populationMode=options.populationMode??'legacy';
    const json=(p:string)=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
    this.layout=json('world_layout.json');
    this.courtyardPath=this.populationMode==='starter-v3'?'castle/courtyard-p2.json':'castle/courtyard.json';
    this.natureSamplePath=this.populationMode==='starter-v3'?'nature/p2-sample-v3/collision.json':null;
    const courtyard=json(this.courtyardPath);
    const replaced=new Set(courtyard.tavern?.replacesLandmarks??[]);
    const digest=createHash('sha256');
    digest.update('surface-slope-50-degrees-v2');
    const interiors=json('interiors/spaces.json').spaces;
    this.spaces={} as Record<SpaceId,FinalSpace>;
    for(const id of ['surface','mine','great_cave'] as SpaceId[]){
      const meta=json(id==='surface'?'geology-D13/terrain.json':`interiors/${id}.json`);
      const bytes=readFileSync(resolve(root,id==='surface'?'geology-D13/heightmap.f32':`interiors/${meta.floor}`));digest.update(bytes);
      const supports=id==='surface'?[...json('geography/support-surfaces.json').surfaces,...(courtyard.supportSurfaces??[])]:[];
      const terrain=new FinalTerrain(meta,bytes,supports),collision=new FinalCollision();
      const surfaceLayers=['geography/collision.json','nature/collision-D13.json','nature/groundcover-collision-D13.json',this.courtyardPath,...(this.natureSamplePath?[this.natureSamplePath]:[])];
      const obstacles:Obstacle[]=id==='surface'?surfaceLayers.flatMap(p=>json(p).obstacles).filter(o=>!replaced.has(o.landmark)):meta.obstacles;
      digest.update(JSON.stringify({obstacles,supports}));
      for(const o of obstacles){
        if(o.kind==='circle')collision.addCircle(o.x,o.z,o.radius,o.bottom,o.top);
        else if(o.blocksMovement===false)collision.addOverhang(o.x,o.z,o.halfX,o.halfZ,o.rotation,o.bottom!,o.top!);
        else collision.addBox(o.x,o.z,o.halfX,o.halfZ,o.rotation,o.bottom,o.top);
      }
      const definition=id==='surface'?null:interiors.find((s:any)=>s.id===id);
      const bounds=id==='surface'?[-796,-696,796,696]:[meta.bounds[0]+1,-meta.bounds[3]+1,meta.bounds[2]-1,-meta.bounds[1]-1];
      const space:FinalSpace={id,terrain,collision,bounds,definition};this.spaces[id]=space;
      collision.walkable=(p,r)=>this.walkable(space,p,r);
    }
    // Preserve service IDs, catalogues and names. Only authored anchors move.
    const placements:Record<string,number[]>={shop:[-111,190],elder:[-100,180],smith:[-135,188],teleport:[-86,191],alchemist:[-125,180],storage:[-75,189]};
    const village:Record<string,number[]>={shop:[-502,354],elder:[-490,347],smith:[-523,358],teleport:[-481,357],alchemist:[-467,347],storage:[-476,366]};
    for(const [id,npc] of Object.entries(SERVICES)){
      const raw=(id.includes(':asterhold:')?village:placements)[id.split(':').at(-1)!];
      const p=this.spaces.surface.collision.findNearestFree({x:raw[0],z:-raw[1]},.8);
      if(this.spaces.surface.collision.isBlocked(p,.8))throw Error('final-service-blocked:'+id);
      this.services[id]={...npc,...p,spaceId:'surface'};
    }
    if(courtyard.tavern?.bookService){
      const {id,...bookSeller}=courtyard.tavern.bookService;
      if(this.spaces.surface.collision.isBlocked(bookSeller,.8))throw Error('tavern-bookseller-blocked');
      this.services[id]={...bookSeller,spaceId:'surface'};
    }
    const legacySlots:SpawnSlot[]=loadPopulation?json('gameplay/spawn-manifest.json').slots:[];
    if(loadPopulation&&(legacySlots.length!==1000||new Set(legacySlots.map(s=>s.uid)).size!==1000))throw Error('final-population-capacity');
    if(loadPopulation)legacySlots.push(structuredClone(CAVE_BOSS_SLOT));
    if(!loadPopulation&&this.populationMode!=='legacy')throw Error('population-mode-requires-population');
    this.populationPlan=selectP2Population(legacySlots,this.populationMode);
    this.slots=this.populationPlan.slots;
    this.slotById=new Map(this.slots.map(s=>[s.uid,s]));
    digest.update(JSON.stringify({layout:this.layout,slots:this.slots,services:this.services}));
    if(this.populationMode!=='legacy')digest.update(JSON.stringify({populationMode:this.populationMode,populationDigest:this.populationPlan.digest}));
    this.mapVersion=this.revision+(this.populationMode==='legacy'?'':'-'+this.populationMode)+'-'+digest.digest('hex');
  }
  space(p:SpatialPoint):FinalSpace{return this.spaces[spaceOf(p)];}
  /** Hunting identity is distinct from the unchanged protected city contour. */
  populationLocation(p:SpatialPoint):string {
    if(spaceOf(p)!=='surface')return '';
    if(this.populationMode==='starter-v3'&&inPolygon(p.x,-p.z,P2_L02_HUNTING_CONTOUR))return 'L02';
    return this.layout.locations.find((location:any)=>inPolygon(p.x,-p.z,location.outline_xz))?.id??'';
  }
  safe(p:SpatialPoint,margin=0):boolean{
    if(spaceOf(p)!=='surface')return false;
    const x=p.x,z=-p.z;
    if(this.layout.locations.filter((l:any)=>l.safe).some((l:any)=>inPolygon(x,z,l.outline_xz)||margin>0&&l.outline_xz.some((a:number[],i:number)=>segmentGap(x,z,a,l.outline_xz[(i+1)%l.outline_xz.length])<margin)))return true;
    if(Math.abs(x-427)<65+margin&&Math.abs(z-57)<57+margin)return true;
    return this.layout.roads.filter((r:any)=>r.kind==='protected').some((r:any)=>r.points_xyz.some((a:number[],i:number)=>i>0&&segmentGap(x,z,[a[0],a[2]],[r.points_xyz[i-1][0],r.points_xyz[i-1][2]])<r.width/2+3+margin));
  }
  walkable(space:FinalSpace,p:Point2,radius:number):boolean{
    const b=space.bounds;
    if(p.x-radius<b[0]||p.z-radius<b[1]||p.x+radius>b[2]||p.z+radius>b[3])return false;
    const x=p.x,z=-p.z,t=space.terrain,y=t.supportAt(p.x,p.z);
    if(space.id!=='surface'){
      const s=space.definition;
      const fits=(xx:number,zz:number)=>s.rooms.some((room:any)=>((xx-room.center[0])/room.radii[0])**2+((zz-room.center[1])/room.radii[1])**2<.98)
        ||s.corridors.some((c:any)=>c.points.some((a:number[],i:number)=>i>0&&segmentGap(xx,zz,a,c.points[i-1])<c.width/2-.25));
      if(![[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>fits(x+dx,z+dz)))return false;
    }else{
      const water=this.layout.water;
      if(inPolygon(x,z,water.lake.polygon)&&y<water.lake.level+.12)return false;
      if(inPolygon(x,z,water.swamp.polygon)&&y<water.swamp.level-.25)return false;
      for(let i=1;i<water.river.centerline_xyz.length;i++){
        const a=water.river.centerline_xyz[i-1],c=water.river.centerline_xyz[i];
        if(segmentGap(x,z,[a[0],a[2]],[c[0],c[2]])<water.river.width/2+radius&&y<Math.max(a[1],c[1])+1)return false;
      }
    }
    const step=.5,dx=(t.supportAt(p.x+step,p.z)-t.supportAt(p.x-step,p.z))/(2*step),dz=(t.supportAt(p.x,p.z+step)-t.supportAt(p.x,p.z-step))/(2*step);
    // Ordinary forest hills are traversable in both directions. Authored
    // trunks, rocks, walls and water still own their physical exclusions.
    const maximumSlope = space.id === 'surface' ? 50 : 20;
    return Number.isFinite(y)&&Math.hypot(dx,dz)<=Math.tan(maximumSlope*Math.PI/180)+.015;
  }
}
