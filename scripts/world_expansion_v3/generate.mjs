import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FinalWorld} from '../../src/world/final-world.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {WORLD_V3_REVISION,WORLD_V3_ACTIVATION,WORLD_V3_TARGET,WORLD_V3_LOCATION_COUNTS,
 MOBS_V3,HUNTING_ZONES_V3,MINI_BOSSES_V3,MAJOR_BOSSES_V3,mobV3,zoneLevelBand,layoutToRuntime,runtimeToLayout} from '../../src/data/world-expansion-v3.ts';
import {SAFE_CORES,CORE_SPAWN_MARGIN,eligible,safeAt,inZone,locationPolygon} from './spatial.mjs';
import {buildAccessGraph} from './access-graph.mjs';

const round=n=>Math.round(n*1000)/1000;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const hash=data=>createHash('sha256').update(data).digest('hex');
const sum=items=>items.reduce((n,v)=>n+v,0);
const criticalHabitats={
 'L01-A':{'MOB-03':[-455,393],'MOB-02':[-515,395],'MOB-05':[-550,395]},
 'L01-B':{'MOB-10':[-570,340]},
 'L02-A':{'MOB-01':[-225,207],'MOB-03':[-242,216]},
 'L02-B':{'MOB-04':[-249,165]},
 'L02-C':{'MOB-02':[-239,108],'MOB-05':[-224,82]},
 'L03-A':{'MOB-04':[-345,175],'MOB-06':[-430,170],'MOB-07':[-520,100],'MOB-08':[-665,20]},
 'L03-B':{'MOB-09':[-480,-95],'MOB-11':[-610,-80],'MOB-15':[-650,-180]},
 'L03-C':{'MOB-21':[-345,-310],'MOB-22':[-275,-330],'MOB-25':[-170,-345],'MOB-26':[-140,-500],'MOB-27':[-240,-510]},
};
function habitatAnchor(zone,mobId){
 if(criticalHabitats[zone.id]?.[mobId])return layoutToRuntime(criticalHabitats[zone.id][mobId]);
 const index=zone.counts.findIndex(c=>c.mobId===mobId),t=index-Math.max(0,zone.counts.length-1)/2;
 return layoutToRuntime([zone.anchorLayout[0]+t*(zone.spaceId==='surface'?55:22),zone.anchorLayout[1]-t*(zone.spaceId==='surface'?32:15)]);
}
function sourceSnapshot(world){
 const rel=['world_layout.json','geology-D13/terrain.json','geology-D13/heightmap.f32','geography/collision.json',
 'geography/support-surfaces.json','nature/collision-D13.json','nature/groundcover-collision-D13.json',
 'castle/courtyard.json','interiors/spaces.json'];
 for(const id of ['mine','great_cave']){
  rel.push('interiors/'+id+'.json');
  const meta=JSON.parse(readFileSync(resolve(world.root,'interiors',id+'.json'),'utf8'));
  // Use the same terrain byte source as FinalWorld, never a guessed layout grid.
  rel.push('interiors/'+meta.floor);
 }
 const source=rel.map(path=>({path:'godot-pc/world-final/'+path,sha256:hash(readFileSync(resolve(world.root,path)))}));
 for(const path of ['src/data/world-expansion-v3.ts','src/world/final-world.ts','src/world/collision-world.ts','src/world/navigation.ts',
  'scripts/world_expansion_v3/spatial.mjs','scripts/world_expansion_v3/access-graph.mjs','scripts/world_expansion_v3/generate.mjs']){
  source.push({path,sha256:hash(readFileSync(resolve(path)))});
 }
 return source;
}
function sourcePopulation(world) {
 const manifest=JSON.parse(readFileSync(resolve(world.root,'gameplay/spawn-manifest.json'),'utf8'));
 return Array.isArray(manifest)?manifest:manifest.slots;
}
function boundsFor(world,zone){
 if(zone.spaceId!=='surface')return world.spaces[zone.spaceId].bounds;
 const poly=locationPolygon(world,zone.locationId);
 return [Math.min(...poly.map(p=>p[0])),-Math.max(...poly.map(p=>p[1])),
 Math.max(...poly.map(p=>p[0])),-Math.min(...poly.map(p=>p[1]))];
}
export function generatePopulation({world=new FinalWorld(undefined,false),log=()=>{}}={}){
 const graphs=Object.fromEntries(['surface','mine','great_cave'].map(id=>{
  const graph=buildAccessGraph(world,id);log(id+': reachable cells '+graph.reachableCount);return [id,graph];
 }));
 const slots=[],groups=[],pools=new Map(),arenas=[];
 const pointWithY=(p)=>({...p,y:round(world.spaces[p.spaceId].terrain.supportAt(p.x,p.z))});
 for(const zone of HUNTING_ZONES_V3){
  const candidates=[],b=boundsFor(world,zone),space=world.spaces[zone.spaceId];
  const step=3;
  for(let x=Math.ceil(b[0]/step)*step;x<b[2];x+=step)for(let z=Math.ceil(b[1]/step)*step;z<b[3];z+=step){
   const p={x,z,spaceId:zone.spaceId};
   if(eligible(world,zone,p)&&graphs[zone.spaceId].nodeFor(p)!==undefined)candidates.push(p);
  }
  pools.set(zone.id,candidates);
 }
 // Reserve bosses first; no ordinary cluster may consume an encounter centre.
 for(const [kind,bosses] of [['major',MAJOR_BOSSES_V3],['mini',MINI_BOSSES_V3]]){
  for(const boss of bosses){
   const point={...layoutToRuntime(boss.anchorLayout),spaceId:boss.spaceId};
   const zones=HUNTING_ZONES_V3.filter(z=>z.locationId===boss.locationId&&z.spaceId===boss.spaceId);
   let candidate;
   if(boss.preserveUid) {
    // Accepted cave boss is an exact retained slot, including its runtime UID.
    if(world.spaces[boss.spaceId].collision.isBlocked(point,boss.actorRadius+.25)||graphs[boss.spaceId].nodeFor(point)===undefined)throw Error('Preserved cave boss slot blocked');
    candidate=point;
   } else {
    const options=zones.flatMap(z=>pools.get(z.id)).sort((a,b)=>distance(a,point)-distance(b,point));
    candidate=options.find(p=>!safeAt(world,p,CORE_SPAWN_MARGIN+boss.actorRadius)&&
      !world.spaces[p.spaceId].collision.isBlocked(p,boss.actorRadius+.5)&&
      arenas.every(a=>a.spaceId!==p.spaceId||distance(a,p)>a.radius+12));
   }
   if(!candidate)throw Error('No safe reachable boss arena '+boss.id);
   const zone=zones.find(z=>inZone(world,z,candidate));
   // Boss arena extent is a reserved clear population pocket, not a claim that
   // the entire disc is flat. Native movement/telegraph QA remains an activation gate.
   const arena={id:'arena:'+boss.id,...pointWithY(candidate),radius:kind==='major'?23:12,kind};
   arenas.push(arena);
   slots.push({uid:boss.preserveUid??'wv3:'+boss.locationId+':'+boss.id.toLowerCase(),kind,
    speciesId:boss.speciesId,bossId:boss.id,locationId:boss.locationId,regionId:boss.locationId,
    subzoneId:zone?.id??'L07-A',groupId:arena.id,level:boss.level,actorRadius:boss.actorRadius,
    ...pointWithY(candidate),layoutXZ:runtimeToLayout(candidate),patrol:[],aggroRadius:boss.aggroRadius,
    leashRadius:boss.leashRadius,accessNode:graphs[boss.spaceId].nodeFor(candidate),runtimeEnabled:false});
  }
 }
 for(const zone of HUNTING_ZONES_V3){
  const pool=pools.get(zone.id),collision=world.spaces[zone.spaceId].collision;
  const localGroups=[];
  for(const {mobId,count} of zone.counts){
   const mob=mobV3(mobId),anchor=habitatAnchor(zone,mobId),radius=mob.actorRadius;
   const candidates=[...pool].sort((a,b)=>distance(a,anchor)-distance(b,anchor)||a.x-b.x||a.z-b.z);
   let placed=0,number=0;
   while(placed<count){
    const remaining=count-placed,desired=Math.min(5,remaining);
    let best;
    for(const center of candidates){
     const compact=['L01','L02'].includes(zone.locationId);
     if(localGroups.some(g=>distance(g,center)<(compact?12:zone.spaceId==='surface'?19:11)))continue;
     if(arenas.some(a=>a.spaceId===zone.spaceId&&distance(a,center)<a.radius+4))continue;
     const members=candidates.filter(p=>distance(p,center)<(compact?7:8)&&
       !safeAt(world,p,CORE_SPAWN_MARGIN+radius)&&!collision.isBlocked(p,radius+.25)&&
       !arenas.some(a=>a.spaceId===zone.spaceId&&distance(a,p)<a.radius+2)&&
       !slots.some(s=>s.spaceId===zone.spaceId&&distance(s,p)<s.actorRadius+radius+.4)&&
       pathSegmentIsClear(collision,center,p,radius))
       .sort((a,b)=>distance(a,center)-distance(b,center));
     const admitted=[];
     for(const p of members){
      if(admitted.every(a=>distance(a,p)>=2*radius+.4))admitted.push(p);
      if(admitted.length===desired)break;
     }
     if(admitted.length>=Math.min(2,desired)){best={center,members:admitted};break;}
    }
    if(!best)throw Error('Population capacity failure '+zone.id+' '+mobId+': '+placed+'/'+count+'; do not relax safety to force the quota');
    const groupId='wv3:'+zone.id+':'+mobId+':g'+String(number++).padStart(3,'0');
    const group={id:groupId,zoneId:zone.id,mobId,...best.center,memberCount:best.members.length,
     sharedAggro:false,habitatAnchor:runtimeToLayout(anchor)};
    localGroups.push(group);groups.push(group);
    for(const p of best.members){
     const level=mob.levelBand[0]+Math.min(mob.levelBand[1]-mob.levelBand[0],
      Math.floor(placed*(mob.levelBand[1]-mob.levelBand[0]+1)/count));
     slots.push({uid:'wv3:'+zone.id+':'+mobId+':'+String(placed++).padStart(3,'0'),kind:'ordinary',
      mobId,speciesId:mob.speciesId,locationId:zone.locationId,regionId:zone.locationId,subzoneId:zone.id,
      groupId,level,actorRadius:radius,...pointWithY(p),layoutXZ:runtimeToLayout(p),
      patrol:[],aggroRadius:9,leashRadius:15,accessNode:graphs[zone.spaceId].nodeFor(p),runtimeEnabled:false});
    }
   }
  }
  log(zone.id+': '+sum(zone.counts.map(c=>c.count))+' ordinary / '+pool.length+' reachable candidates');
 }
 const routes=HUNTING_ZONES_V3.map(zone=>{
  const zoneSlots=slots.filter(s=>s.kind==='ordinary'&&s.subzoneId===zone.id),target=zoneSlots[0];
  return {id:'route:'+zone.id,zoneId:zone.id,locationId:zone.locationId,spaceId:zone.spaceId,
   levelBand:zoneLevelBand(zone),path:graphs[zone.spaceId].pathTo(target).map(p=>pointWithY({...p,spaceId:zone.spaceId}))};
 });
 const portals=['mine','great_cave'].map(spaceId=>{
  const raw=world.spaces[spaceId].definition.surface_portal;
  const point={x:raw[0],z:-raw[2],spaceId:'surface'};
  const path=graphs.surface.pathTo(point);
  if(!path)throw Error('Interior surface portal disconnected: '+spaceId);
  return {id:'portal:'+spaceId,spaceId,surface:pointWithY(point),arrival:graphs[spaceId].start,
   surfaceRoute:path.map(p=>pointWithY({...p,spaceId:'surface'}))};
 });
 const source=sourceSnapshot(world);
 const legacy=sourcePopulation(world);
 const mapping=legacy.map(s=>({oldUid:s.uid,speciesId:s.speciesId,action:['mini','big','rift_boss'].includes(s.speciesId)?'preserve-boss-identity-and-death-state':'retire-slot-preserve-audit',
  newUid:slots.find(n=>n.kind==='major'&&n.speciesId===s.speciesId)?.uid??null}));
 mapping.push({oldUid:'wf:great_cave:cave_boss:000',speciesId:'cave_boss',action:'preserve-exact-uid-level-reward-death-state',newUid:'wf:great_cave:cave_boss:000'});
 const population={schema:1,revision:WORLD_V3_REVISION,status:'staged-spatial-candidate-not-live',activation:WORLD_V3_ACTIVATION,
 coordinateContract:{runtime:'east +X, north +Z, height +Y; interior coordinates local metres',layout:'east +X, south +Z; Blender export (x,layoutZ,height)',transform:'runtimeZ = -layoutZ'},
 target:WORLD_V3_TARGET,source,counts:{ordinary:slots.filter(s=>s.kind==='ordinary').length,mini:slots.filter(s=>s.kind==='mini').length,major:slots.filter(s=>s.kind==='major').length,total:slots.length},
 locations:WORLD_V3_LOCATION_COUNTS,slots,groups};
 const layout={schema:1,revision:WORLD_V3_REVISION,coordinateContract:population.coordinateContract,boundsLayout:[-800,-700,800,700],
 source,locations:world.layout.locations.map(l=>({id:l.id,name:l.name_ru,outlineLayout:locationPolygon(world,l.id),previousOutlineLayout:l.outline_xz,
  boundaryChanged:JSON.stringify(l.outline_xz)!==JSON.stringify(locationPolygon(world,l.id))})),
 safeCores:SAFE_CORES,safeSpawnMargin:CORE_SPAWN_MARGIN,roads:world.layout.roads.map(r=>({id:r.id,kind:r.kind,width:r.width,pointsLayout:r.points_xyz})),
 zones:HUNTING_ZONES_V3.map(z=>({...z,levelBand:zoneLevelBand(z),geometryRule:z.locationId==='L03'?'location AND biome mask AND north/south split':z.spaceId==='surface'?'location AND nearest zone anchor':'room ellipse 83 percent AND cave depth split',
  ordinary:sum(z.counts.map(c=>c.count))})),arenas,routes,portals,
 access:Object.values(graphs).map(g=>({spaceId:g.spaceId,step:g.step,start:g.start,reachableCells:g.reachableCount})),
 activationGates:WORLD_V3_ACTIVATION.requiredGates};
 const migration={schema:1,from:'world-final-gameplay-1',to:WORLD_V3_REVISION,mode:'dry-run-only',
 transactionRules:['backup-and-restore-test-before-activation','server-authoritative-single-transaction','never-copy-an-old-death-reward-to-a-new-slot',
 'preserve-existing-boss-death-generation-reward-ledger-and-respawn-deadline','retire-old-ordinary-ids-with-tombstones-not-id-reuse','initialize-new-ids-once','no-live-spawn-change-before-asset-and-balance-gates'],
 legacyCount:mapping.length,newCount:slots.length,preservedCaveReward:true,mapping,newOnly:slots.filter(s=>!mapping.some(m=>m.newUid===s.uid)).map(s=>s.uid)};
 return {population,layout,migration};
}
export function writePopulation(output=resolve('docs/world-expansion-v3'),options={}){
 const result=generatePopulation(options);mkdirSync(output,{recursive:true});
 for(const [name,data] of Object.entries(result))writeFileSync(resolve(output,name==='layout'?'hunting-layout.json':name+'.json'),JSON.stringify(data,null,2)+'\n');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const checking=process.argv.includes('--check');
 const result=checking?generatePopulation({log:console.log}):writePopulation(undefined,{log:console.log});
 if(checking)for(const [name,data] of Object.entries(result)){
  const path=resolve('docs/world-expansion-v3',name==='layout'?'hunting-layout.json':name+'.json');
  if(readFileSync(path,'utf8')!==JSON.stringify(data,null,2)+'\n')throw Error('Stale or non-deterministic output: '+path);
 }
 console.log(JSON.stringify(result.population.counts));
}
