import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld,inPolygon} from '../../src/world/final-world.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {buildAccessGraph} from './access-graph.mjs';
import {roadDistance} from './spatial.mjs';
import {MOBS_V3,SURFACE_LOCATION_OVERRIDES_V3} from '../../src/data/world-expansion-v3.ts';
import {FIRST_HUNTING_BEHAVIORS_V3} from '../../src/data/encounter-balance-v3.ts';

const world=new FinalWorld(undefined,false),collision=world.spaces.surface.collision;
const source=JSON.parse(readFileSync('docs/world-expansion-v3/population.json','utf8'));
const profiles=JSON.parse(readFileSync('docs/world-expansion-v3/P2_ACTOR_ADAPTERS.json','utf8')).profiles;
const originals=source.slots.filter(s=>s.locationId==='L02'&&s.kind==='ordinary');
if(originals.length!==150)throw Error('P2 needs the canonical 150 ordinary L02 slots');
const graph=buildAccessGraph(world,'surface');
const radius=id=>profiles[id].body_radius_proposed;
const valid=(p,mobId)=>{
 const r=radius(mobId);
 return inPolygon(p.x,-p.z,SURFACE_LOCATION_OVERRIDES_V3.L02)&&!world.safe(p,10+r)&&
  !collision.isBlocked(p,Math.max(.46,r)+.25)&&Number.isFinite(world.spaces.surface.terrain.supportAt(p.x,p.z))&&
  !world.layout.roads.some(road=>roadDistance(p,road)<road.width/2+2+r)&&graph.nodeFor(p)!==undefined;
};
const candidates=[];
for(let x=-270;x<=20;x+=2)for(let z=-270;z<=-50;z+=2){
 const p={x,z,spaceId:'surface'};if(valid(p,'MOB-02'))candidates.push(p);
}
const wolves=originals.filter(s=>s.mobId==='MOB-02').sort((a,b)=>a.uid.localeCompare(b.uid));
const pairs=[];
// Spread independent 8 m perception circles with a 3 m empty passage. Members
// of one pair are 3 m apart; circles of distinct pairs never overlap.
for(let i=0;i<Math.ceil(wolves.length/2);i++){
 const first=wolves[i*2],second=wolves[i*2+1],options=[];
 for(const p of candidates)for(const [dx,dz]of [[0,3],[3,0]]){
  const members=second?[p,{x:p.x+dx,z:p.z+dz,spaceId:'surface'}]:[p];
  if(members.some(m=>!valid(m,'MOB-02')))continue;
  if(pairs.some(pair=>pair.members.some(a=>members.some(b=>Math.hypot(a.x-b.x,a.z-b.z)<19))))continue;
  // Favor original hunting area, but use the whole lawful L02 outskirts when
  // compact P0 placement groups cannot host independent territorial pairs.
  const score=Math.hypot(p.x-first.x,p.z-first.z)+pairs.reduce((n,pair)=>n+2/Math.max(1,Math.hypot(p.x-pair.members[0].x,p.z-pair.members[0].z)),0);
  options.push({members,score});
 }
 options.sort((a,b)=>a.score-b.score||a.members[0].x-b.members[0].x||a.members[0].z-b.members[0].z);
 if(!options.length)throw Error('No safe connected space for territorial pair '+i+' after '+pairs.length+' pairs');
 pairs.push({groupId:'p2:L02:wolf-pair:'+String(i).padStart(2,'0'),members:options[0].members,source:[first,second].filter(Boolean)});
}
const occupied=pairs.flatMap(pair=>pair.members.map((p,i)=>({...p,uid:pair.source[i].uid,mobId:'MOB-02'})));
const territorialHomes=[...occupied];
const noWolfContact=p=>territorialHomes.every(w=>Math.hypot(p.x-w.x,p.z-w.z)>=11);
const wolfAvoidCollision={findNearestFree:collision.findNearestFree.bind(collision),
 isBlocked:(p,r)=>collision.isBlocked(p,r)||(!world.safe({...p,spaceId:'surface'})&&territorialHomes.some(w=>Math.hypot(p.x-w.x,p.z-w.z)<8+r))};
const wolfAvoidWorld={...world,spaces:{...world.spaces,surface:{...world.spaces.surface,bounds:[-300,-285,40,-35],collision:wolfAvoidCollision}}};
const wolfAvoidGraph=buildAccessGraph(wolfAvoidWorld,'surface',{step:2});
const reservedQuestUids=new Set(['MOB-01','MOB-03'].flatMap(id=>originals.filter(s=>s.mobId===id).sort((a,b)=>a.level-b.level||a.uid.localeCompare(b.uid)).slice(0,id==='MOB-01'?10:8).map(s=>s.uid)));
const changes=[],out=[];
const set=(source,p,groupId,reason)=>{
 const behavior=FIRST_HUNTING_BEHAVIORS_V3.find(b=>b.mobId===source.mobId),mob=MOBS_V3.find(m=>m.id===source.mobId);
 const value={uid:source.uid,speciesId:source.speciesId,canonicalMobId:source.mobId,level:source.level,
  name:mob.name,locationId:'L02',subzoneId:source.subzoneId,groupId,boss:false,x:p.x,z:p.z,spaceId:'surface',
  bodyRadius:radius(source.mobId),patrol:[],aggroRadius:behavior.proximityAggro,leashRadius:behavior.leash,
  behavior:{stance:behavior.stance,provocation:behavior.provocation,socialAggro:false},
  balanceVersion:'encounter-balance-v3-candidate-1'};
 out.push(value);
 if(source.x!==p.x||source.z!==p.z||source.groupId!==groupId)changes.push({uid:source.uid,reason,
  from:{x:source.x,z:source.z,groupId:source.groupId},to:{x:p.x,z:p.z,groupId},sourceSubzoneId:source.subzoneId,
  subzoneNote:'Source hunting partition retained as identity; P2 territorial footprint is explicitly reauthored within L02.'});
};
for(const pair of pairs)pair.members.forEach((p,i)=>set(pair.source[i],p,pair.groupId,'territorial-pair-perception-and-empty-passage'));
for(const s of originals.filter(s=>s.mobId!=='MOB-02').sort((a,b)=>a.uid.localeCompare(b.uid))){
 const free=p=>valid(p,s.mobId)&&occupied.every(o=>Math.hypot(p.x-o.x,p.z-o.z)>=radius(s.mobId)+radius(o.mobId)+1)&&
  (!reservedQuestUids.has(s.uid)||(noWolfContact(p)&&wolfAvoidGraph.nodeFor(p)!==undefined));
 let p={x:s.x,z:s.z,spaceId:'surface'},reason='separate-passive-placement-identity';
 if(!free(p)){
  const choices=[];
  for(let x=-270;x<=20;x+=2)for(let z=-270;z<=-50;z+=2){const q={x,z,spaceId:'surface'};if(free(q))choices.push(q);}
  choices.sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)||a.x-b.x||a.z-b.z);
  if(!choices.length)throw Error('No safe P2 rehome '+s.uid);p=choices[0];reason=reservedQuestUids.has(s.uid)?'first-quests-outside-wolf-perception':world.safe(s,10+radius(s.mobId))?'legacy-safe-contour-and-10m-buffer':'collision-or-pair-body-clearance';
 }
 occupied.push({...p,uid:s.uid,mobId:s.mobId});set(s,p,'p2:'+s.uid,reason);
}
// Shared grazing pack identity is observed by QUEST-104, but never implies
// social aggro. Group neighbouring boars in pairs, with one final group of 3.
const boars=out.filter(s=>s.canonicalMobId==='MOB-04').sort((a,b)=>a.uid.localeCompare(b.uid));
const boarPacks=[];
while(boars.length){
 const first=boars.shift(),members=[first];
 boars.sort((a,b)=>Math.hypot(a.x-first.x,a.z-first.z)-Math.hypot(b.x-first.x,b.z-first.z)||a.uid.localeCompare(b.uid));
 if(boars.length)members.push(boars.shift());
 if(boars.length===1)members.push(boars.shift());
 const groupId='p2:L02:boar-pack:'+String(boarPacks.length).padStart(2,'0');
 for(const s of members){s.groupId=groupId;const change=changes.find(c=>c.uid===s.uid);if(change)change.to.groupId=groupId;}
 boarPacks.push({groupId,uids:members.map(s=>s.uid),maxSeparation:Math.max(...members.flatMap(a=>members.map(b=>Math.hypot(a.x-b.x,a.z-b.z))))});
}
out.sort((a,b)=>a.uid.localeCompare(b.uid));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHashes=['docs/world-expansion-v3/population.json','docs/world-expansion-v3/P2_ACTOR_ADAPTERS.json',
 'godot-pc/world-final/world_layout.json','godot-pc/world-final/gameplay/spawn-manifest.json'].map(path=>({path,sha256:sha(path)}));
const digest=createHash('sha256').update(JSON.stringify(out)).digest('hex');
const metadata={schema:1,mode:'starter-v3',version:'p2-starter-population-v3-1',digest,source:sourceHashes,
 total:150,defaultEnabled:false,legacyOrdinaryRetirement:'Only locationId L02 AND boss=false; current source has zero such slots.',
 counts:Object.fromEntries(MOBS_V3.slice(0,5).map(m=>[m.id,out.filter(s=>s.canonicalMobId===m.id).length])),
 safePolicy:'Unchanged legacy city contours/protected roads, plus 10 m spawn margin; administrative L02 extension never becomes safe.',
 pairPolicy:'13 groups (12 pairs and one lone hound), 8 m independent LOS perception; every cross-group home distance >=19 m; no hard attacker cap.',
 boarPacks,
 positionsChanged:out.filter(s=>{const old=originals.find(o=>o.uid===s.uid);return old.x!==s.x||old.z!==s.z;}).length,
 firstQuestSafety:{reservedUids:[...reservedQuestUids].sort(),slimes:10,rats:8,
  policy:'Spawn homes >=11 m from all territorial hounds; connected approach from actual start avoids their 8 m perception circles with hero-radius margin.',
  routes:out.filter(s=>reservedQuestUids.has(s.uid)).map(s=>({uid:s.uid,points:wolfAvoidGraph.pathTo(s)}))},
 changes,slots:out};
const generated='/** Generated by prepare-p2.mjs. Explicit opt-in population; no terrain edits. */\n'+
 'export const P2_STAGED_POPULATION_META='+JSON.stringify({version:metadata.version,digest,counts:metadata.counts},null,2)+' as const;\n'+
 'export const P2_STAGED_SLOTS_V3='+JSON.stringify(out,null,2)+' as const;\n';
const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="960" viewBox="-300 20 370 285">',
 '<rect x="-300" y="20" width="370" height="285" fill="#101a21"/>',
 '<text x="-285" y="34" font-size="7" fill="#f5f0d7">P2: Гринфолл · 150 ordinary · east +X / south +layoutZ</text>',
 '<text x="-285" y="43" font-size="4" fill="#a8b8c1">Точки — планируемые тела; круги — восприятие8м. Зелёный — прежний safe. Ландшафт не изменён.</text>'];
for(const road of world.layout.roads)svg.push('<polyline points="'+road.points_xyz.map(p=>p[0]+','+p[2]).join(' ')+'" fill="none" stroke="'+(road.kind==='protected'?'#497a6a':'#5d5147')+'" stroke-width="'+road.width+'" opacity=".45"/>');
for(const loc of world.layout.locations.filter(l=>l.safe))svg.push('<polygon points="'+loc.outline_xz.map(p=>p.join(',')).join(' ')+'" fill="#266b52" fill-opacity=".3" stroke="#5ba98a" stroke-width=".7"/>');
svg.push('<polygon points="'+SURFACE_LOCATION_OVERRIDES_V3.L02.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#9aa6bc" stroke-dasharray="2 2" stroke-width=".7"/>');
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
