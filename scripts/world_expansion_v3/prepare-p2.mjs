import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld,inPolygon} from '../../src/world/final-world.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {buildAccessGraph} from './access-graph.mjs';
import {roadDistance} from './spatial.mjs';
import {MOBS_V3,SURFACE_LOCATION_OVERRIDES_V3} from '../../src/data/world-expansion-v3.ts';
import {FIRST_HUNTING_BEHAVIORS_V3} from '../../src/data/encounter-balance-v3.ts';
import {P2_L02_HUNTING_CONTOUR,P2_HABITAT_LAYOUT_VERSION} from '../../src/data/p2-habitat-layout.ts';

const world=new FinalWorld(undefined,false),collision=world.spaces.surface.collision;
const source=JSON.parse(readFileSync('docs/world-expansion-v3/population.json','utf8'));
const profiles=JSON.parse(readFileSync('docs/world-expansion-v3/P2_ACTOR_ADAPTERS.json','utf8')).profiles;
const originals=source.slots.filter(s=>s.locationId==='L02'&&s.kind==='ordinary');
if(originals.length!==150)throw Error('P2 needs the canonical 150 ordinary L02 slots');
const graph=buildAccessGraph(world,'surface');
const radius=id=>profiles[id].body_radius_proposed;
const valid=(p,mobId)=>{
 const r=radius(mobId);
 return inPolygon(p.x,-p.z,P2_L02_HUNTING_CONTOUR)&&!world.safe(p,10+r)&&
  !collision.isBlocked(p,Math.max(.46,r)+.25)&&Number.isFinite(world.spaces.surface.terrain.supportAt(p.x,p.z))&&
  !world.layout.roads.some(road=>roadDistance(p,road)<road.width/2+2+r)&&graph.nodeFor(p)!==undefined;
};
// Jittered continuous candidates are a search substrate, never an ordered spawn row.
const hash=key=>{let n=2166136261;for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)/4294967296;};
const round=n=>Number(n.toFixed(3));
const candidates=[];
for(let x=-310;x<=20;x+=2)for(let z=-270;z<=-50;z+=2){
 const p={x:round(x+(hash(x+':'+z+':x')-.5)*1.7),z:round(z+(hash(x+':'+z+':z')-.5)*1.7),spaceId:'surface'};
 if(valid(p,'MOB-02'))candidates.push(p);
}
const byLevel=id=>originals.filter(s=>s.mobId===id).sort((a,b)=>a.level-b.level||a.uid.localeCompare(b.uid));
const reservedQuestUids=new Set(['MOB-01','MOB-03'].flatMap(id=>byLevel(id).slice(0,id==='MOB-01'?10:8).map(s=>s.uid)));
const changes=[],out=[],occupied=[],habitats=[],boarPacks=[];
const set=(source,p,groupId,reason)=>{
 const behavior=FIRST_HUNTING_BEHAVIORS_V3.find(b=>b.mobId===source.mobId),mob=MOBS_V3.find(m=>m.id===source.mobId);
 const value={uid:source.uid,speciesId:source.speciesId,canonicalMobId:source.mobId,level:source.level,
  name:mob.name,locationId:'L02',subzoneId:source.subzoneId,groupId,boss:false,x:p.x,z:p.z,spaceId:'surface',
  bodyRadius:radius(source.mobId),patrol:[],aggroRadius:behavior.proximityAggro,leashRadius:behavior.leash,
  behavior:{stance:behavior.stance,provocation:behavior.provocation,socialAggro:false},balanceVersion:'encounter-balance-v3-candidate-1'};
 out.push(value);occupied.push({...p,uid:source.uid,mobId:source.mobId,reserved:reservedQuestUids.has(source.uid)});
 if(source.x!==p.x||source.z!==p.z||source.groupId!==groupId)changes.push({uid:source.uid,reason,
  from:{x:source.x,z:source.z,groupId:source.groupId},to:{x:p.x,z:p.z,groupId},sourceSubzoneId:source.subzoneId,
  subzoneNote:'Source hunting partition retained as identity; natural P2 habitat groups are authored within L02.'});
};
const recipes=[
 {id:'MOB-01',sizes:[4,3,3,4,4,4,4,4,5],anchor:{x:-248,z:-197},zBand:[-211,-170],name:'damp-woodland-pockets'},
 {id:'MOB-03',sizes:[3,3,2,3,3,3,3,3,2],anchor:{x:-266,z:-228},zBand:[-250,-180],name:'field-edge-foraging'},
 {id:'MOB-04',sizes:[...Array(21).fill(2),3],anchor:{x:-263,z:-146},zBand:[-177,-105],name:'grazing-pairs'},
 {id:'MOB-05',sizes:[3,3,3,3,4,4],anchor:{x:-240,z:-85},zBand:[-112,-64],name:'rock-edge-pockets'},
];
for(const recipe of recipes){
 const source=byLevel(recipe.id);let cursor=0;
 for(const [index,size]of recipe.sizes.entries()){
  const selected=source.slice(cursor,cursor+size),key=recipe.id+':'+index,options=[];
  const observationPack=recipe.id==='MOB-04'&&index===0;
  const anchor=observationPack?{x:-278,z:-169}:recipe.anchor;
  for(const center of candidates){
   if(center.z<recipe.zBand[0]||center.z>recipe.zBand[1])continue;
   if(recipe.id==='MOB-04'&&(observationPack?center.z> -167: center.z< -149))continue;
   const angle=hash(key+':'+center.x+':a')*Math.PI*2;
   // Asymmetric triangles/arcs, never identical regular polygons or a lattice.
   const members=Array.from({length:size},(_,i)=>{
    const theta=angle+i*Math.PI*2/size+(hash(key+':'+i+':theta')-.5)*.32;
    const d=size===2?1.65:recipe.id==='MOB-03'?1.9+hash(key+':'+i+':r')*.5:2.7+hash(key+':'+i+':r')*.9;
    return {x:round(center.x+Math.cos(theta)*d),z:round(center.z+Math.sin(theta)*d),spaceId:'surface'};
   });
   if(members.some(p=>!valid(p,recipe.id)))continue;
   if(members.some((p,i)=>members.some((q,j)=>j<i&&Math.hypot(p.x-q.x,p.z-q.z)<2.5)))continue;
   if(members.some(p=>occupied.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<(q.mobId===recipe.id?3.5:5.5))))continue;
   const score=Math.hypot(center.x-anchor.x,(center.z-anchor.z)*.72)+hash(key+':'+center.x+':'+center.z)*5;
   options.push({center,members,score});
  }
  options.sort((a,b)=>a.score-b.score||a.center.x-b.center.x||a.center.z-b.center.z);
  if(!options.length)throw Error('No natural habitat '+key+' after '+cursor+' bodies');
  const choice=options[0],groupId='p2:L02:'+recipe.name+':'+String(index).padStart(2,'0');
  choice.members.forEach((p,i)=>set(selected[i],p,groupId,'natural-habitat-no-grid-row'));cursor+=size;
  habitats.push({groupId,mobId:recipe.id,name:recipe.name,center:choice.center,uids:selected.map(s=>s.uid),reservedQuest:selected.some(s=>reservedQuestUids.has(s.uid))});
  if(recipe.id==='MOB-04')boarPacks.push({groupId,uids:selected.map(s=>s.uid),maxSeparation:Math.max(...choice.members.flatMap(a=>choice.members.map(b=>Math.hypot(a.x-b.x,a.z-b.z))))});
 }
 if(cursor!==source.length)throw Error('Habitat count mismatch '+recipe.id);
}
const wolves=byLevel('MOB-02'),pairs=[];
const boarObservationHabitat=habitats.find(h=>h.mobId==='MOB-04');
for(let i=0;i<Math.ceil(wolves.length/2);i++){
 const selected=wolves.slice(i*2,i*2+2),options=[];
 for(const p of candidates)for(let k=0;k<4;k++){
  const angle=hash('wolf:'+i+':'+p.x)*Math.PI*2+k*Math.PI/2,d=3.1;
  const members=selected.length===2?[p,{x:round(p.x+Math.cos(angle)*d),z:round(p.z+Math.sin(angle)*d),spaceId:'surface'}]:[p];
  if(members.some(m=>!valid(m,'MOB-02')))continue;
  if(pairs.some(pair=>pair.members.some(a=>members.some(b=>Math.hypot(a.x-b.x,a.z-b.z)<19))))continue;
  if(members.some(p=>Math.hypot(p.x-boarObservationHabitat.center.x,p.z-boarObservationHabitat.center.z)<27))continue;
  if(members.some(p=>occupied.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<(q.reserved?11:3))))continue;
  const score=Math.hypot(p.x-selected[0].x,p.z-selected[0].z)+hash('wolf-score:'+i+':'+p.x+':'+p.z)*4;
  options.push({members,score});
 }
 options.sort((a,b)=>a.score-b.score||a.members[0].x-b.members[0].x||a.members[0].z-b.members[0].z);
 if(!options.length)throw Error('No natural territorial pair '+i+' after '+pairs.length+' pairs');
 const pair={groupId:'p2:L02:wolf-pair:'+String(i).padStart(2,'0'),members:options[0].members,source:selected};pairs.push(pair);
 pair.members.forEach((p,j)=>set(selected[j],p,pair.groupId,'territorial-pair-perception-and-empty-passage'));
}
const territorialHomes=out.filter(s=>s.canonicalMobId==='MOB-02');
const wolfAvoidCollision={findNearestFree:collision.findNearestFree.bind(collision),
 isBlocked:(p,r)=>collision.isBlocked(p,r)||(!world.safe({...p,spaceId:'surface'})&&territorialHomes.some(w=>Math.hypot(p.x-w.x,p.z-w.z)<8+r))};
const wolfAvoidWorld={...world,spaces:{...world.spaces,surface:{...world.spaces.surface,bounds:[-330,-285,40,-35],collision:wolfAvoidCollision}}};
const wolfAvoidGraph=buildAccessGraph(wolfAvoidWorld,'surface',{step:2});
for(const s of out.filter(s=>reservedQuestUids.has(s.uid)))if(wolfAvoidGraph.nodeFor(s)===undefined)throw Error('Reserved quest route cut by territorial homes: '+s.uid);
out.sort((a,b)=>a.uid.localeCompare(b.uid));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHashes=['docs/world-expansion-v3/population.json','docs/world-expansion-v3/P2_ACTOR_ADAPTERS.json',
 'godot-pc/world-final/world_layout.json','godot-pc/world-final/gameplay/spawn-manifest.json','src/data/p2-habitat-layout.ts'].map(path=>({path,sha256:sha(path)}));
const digest=createHash('sha256').update(JSON.stringify(out)).digest('hex');
const metadata={schema:1,mode:'starter-v3',version:'p2-starter-population-v3-2',digest,source:sourceHashes,
 total:150,defaultEnabled:false,legacyOrdinaryRetirement:'Only locationId L02 AND boss=false; current source has zero such slots.',
 counts:Object.fromEntries(MOBS_V3.slice(0,5).map(m=>[m.id,out.filter(s=>s.canonicalMobId===m.id).length])),
 safePolicy:'Unchanged legacy city contours/protected roads, plus 10 m spawn margin; administrative L02 extension never becomes safe.',
 pairPolicy:'13 groups (12 pairs and one lone hound), 8 m independent LOS perception; every cross-group home distance >=19 m; no hard attacker cap.',
 habitatLayout:{version:P2_HABITAT_LAYOUT_VERSION,coordinates:'layout-east-X-south-Z',outline:P2_L02_HUNTING_CONTOUR,previousP0Outline:SURFACE_LOCATION_OVERRIDES_V3.L02,safeChanged:false},habitats,boarPacks,
 boarObservation:{groupId:boarObservationHabitat.groupId,center:boarObservationHabitat.center,wolfHomeExclusion:27,policy:'A visible outer grazing pair with room for a real quarter-circle and retreat; no extra safe area or combat cap.'},
 positionsChanged:out.filter(s=>{const old=originals.find(o=>o.uid===s.uid);return old.x!==s.x||old.z!==s.z;}).length,
 firstQuestSafety:{reservedUids:[...reservedQuestUids].sort(),slimes:10,rats:8,
  policy:'Spawn homes >=11 m from all territorial hounds; connected approach from actual start avoids their 8 m perception circles with hero-radius margin.',
  routes:out.filter(s=>reservedQuestUids.has(s.uid)).map(s=>({uid:s.uid,points:wolfAvoidGraph.pathTo(s)}))},
 changes,slots:out};
const generated='/** Generated by prepare-p2.mjs. Explicit opt-in population; no terrain edits. */\n'+
 'export const P2_STAGED_POPULATION_META='+JSON.stringify({version:metadata.version,digest,counts:metadata.counts},null,2)+' as const;\n'+
 'export const P2_STAGED_SLOTS_V3='+JSON.stringify(out,null,2)+' as const;\n';
const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="960" viewBox="-330 20 400 285">',
 '<rect x="-330" y="20" width="400" height="285" fill="#101a21"/>',
 '<text x="-285" y="34" font-size="7" fill="#f5f0d7">P2: Гринфолл · 150 ordinary · east +X / south +layoutZ</text>',
 '<text x="-285" y="43" font-size="4" fill="#a8b8c1">Точки — планируемые тела; круги — восприятие8м. Зелёный — прежний safe. Ландшафт не изменён.</text>'];
for(const road of world.layout.roads)svg.push('<polyline points="'+road.points_xyz.map(p=>p[0]+','+p[2]).join(' ')+'" fill="none" stroke="'+(road.kind==='protected'?'#497a6a':'#5d5147')+'" stroke-width="'+road.width+'" opacity=".45"/>');
for(const loc of world.layout.locations.filter(l=>l.safe))svg.push('<polygon points="'+loc.outline_xz.map(p=>p.join(',')).join(' ')+'" fill="#266b52" fill-opacity=".3" stroke="#5ba98a" stroke-width=".7"/>');
svg.push('<polygon points="'+SURFACE_LOCATION_OVERRIDES_V3.L02.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#677080" stroke-dasharray="1 3" stroke-width=".4"/>');
svg.push('<polygon points="'+P2_L02_HUNTING_CONTOUR.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#9aa6bc" stroke-dasharray="2 2" stroke-width=".7"/>');
for(const s of out.filter(s=>s.canonicalMobId==='MOB-02'))svg.push('<circle cx="'+s.x+'" cy="'+(-s.z)+'" r="8" fill="#ce816c" fill-opacity=".1" stroke="#ce816c" stroke-width=".35"/>');
const colors={'MOB-01':'#83bf78','MOB-02':'#f7ac8a','MOB-03':'#bbb9db','MOB-04':'#cea96b','MOB-05':'#64bcb3'};
for(const s of out)svg.push('<circle cx="'+s.x+'" cy="'+(-s.z)+'" r="1.1" fill="'+colors[s.canonicalMobId]+'"><title>'+s.canonicalMobId+' '+s.uid+' L'+s.level+'</title></circle>');
svg.push('<circle cx="'+world.start.x+'" cy="'+(-world.start.z)+'" r="2.3" fill="#f7e3a4"/><text x="'+(world.start.x+4)+'" y="'+(-world.start.z+2)+'" font-size="5" fill="#f7e3a4">Старт</text>');
MOBS_V3.slice(0,5).forEach((m,i)=>svg.push('<text x="-285" y="'+(272+i*5)+'" font-size="4" fill="'+colors[m.id]+'">'+m.id+' '+m.name+' — '+metadata.counts[m.id]+'</text>'));
svg.push('</svg>');
const files={'docs/world-expansion-v3/P2_POPULATION.json':JSON.stringify(metadata,null,2)+'\n',
 'docs/world-expansion-v3/P2_HUNTING_MAP.svg':svg.join('\n')+'\n','src/data/p2-starter-population-v3.ts':generated};
for(const [path,value]of Object.entries(files)){
 if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==value)throw Error('Stale P2 artifact: '+path);}
 else writeFileSync(path,value);
}
console.log(JSON.stringify({count:out.length,counts:metadata.counts,positionsChanged:metadata.positionsChanged,pairs:pairs.length,digest}));
