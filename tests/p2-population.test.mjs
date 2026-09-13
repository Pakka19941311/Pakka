import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld,inPolygon} from '../src/world/final-world.ts';
import {selectP2Population,remapP2SavedMonsters} from '../src/world/p2-population.ts';
import {MOBS_V3,SURFACE_LOCATION_OVERRIDES_V3} from '../src/data/world-expansion-v3.ts';
import {buildAccessGraph} from '../scripts/world_expansion_v3/access-graph.mjs';
import {roadDistance} from '../scripts/world_expansion_v3/spatial.mjs';
import {pathSegmentIsClear} from '../src/world/navigation.ts';
import {P2_L02_HUNTING_CONTOUR,P2_LOCATION_OVERRIDES} from '../src/data/p2-habitat-layout.ts';
const legacy=new FinalWorld(),p2=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const staged=p2.slots.filter(s=>s.canonicalMobId),source=JSON.parse(readFileSync('docs/world-expansion-v3/population.json','utf8'));

test('explicit P2 adds only 150 canonical L02 ordinary; default remains 1001 and all four bosses match',()=>{
 assert.equal(legacy.populationMode,'legacy');assert.equal(legacy.slots.length,1001);
 assert.equal(p2.populationMode,'starter-v3');assert.equal(p2.slots.length,1151);assert.equal(staged.length,150);
 assert.deepEqual(p2.slots.filter(s=>s.boss),legacy.slots.filter(s=>s.boss));
 assert.equal(p2.slots.filter(s=>s.boss).length,4);assert.deepEqual(p2.populationPlan.retiredLegacyUids,[]);
 assert.equal(new Set(p2.slots.map(s=>s.uid)).size,p2.slots.length);
 for(const s of legacy.slots)assert.deepEqual(p2.slotById.get(s.uid),s,s.uid);
 assert.deepEqual(Object.fromEntries(MOBS_V3.slice(0,5).map(m=>[m.id,staged.filter(s=>s.canonicalMobId===m.id).length])),
  {'MOB-01':35,'MOB-02':25,'MOB-03':25,'MOB-04':45,'MOB-05':20});
});

test('canonical identity, level and exact legacy/new distinction survive placement adaptation',()=>{
 for(const slot of staged){
  const original=source.slots.find(s=>s.uid===slot.uid),mob=MOBS_V3.find(m=>m.id===slot.canonicalMobId);
  assert.equal(slot.level,original.level);assert.equal(slot.speciesId,mob.speciesId);assert.equal(slot.name,mob.name);
  assert.equal(slot.locationId,'L02');assert.equal(slot.boss,false);assert.equal(slot.spaceId,'surface');
  assert.ok(slot.level>=mob.levelBand[0]&&slot.level<=mob.levelBand[1]);assert.ok(slot.level<=9);
  assert.equal(slot.balanceVersion,'encounter-balance-v3-candidate-1');
  assert.ok(inPolygon(slot.x,-slot.z,P2_L02_HUNTING_CONTOUR));
  assert.equal(p2.populationLocation(slot),'L02');
 }
 assert.equal(staged.find(s=>s.canonicalMobId==='MOB-01').name,'Теневой слизень');
 assert.ok(legacy.slots.some(s=>s.speciesId==='wolf'&&!s.canonicalMobId));
 assert.ok(staged.every(s=>Number(s.canonicalMobId.slice(4))<=5));
});

test('natural habitats separate weak species and contain no long grid column; labels share the administrative resolver only',()=>{
 const manifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_POPULATION.json','utf8'));
 assert.deepEqual(P2_LOCATION_OVERRIDES[0].outline_xz,manifest.habitatLayout.outline);
 assert.equal(manifest.habitatLayout.safeChanged,false);
 assert.ok(staged.some(s=>!inPolygon(s.x,-s.z,SURFACE_LOCATION_OVERRIDES_V3.L02)));
 for(const s of staged){assert.equal(p2.populationLocation(s),'L02');assert.equal(p2.safe(s),false);}
 assert.equal(p2.populationLocation({x:-240,z:-200,spaceId:'mine'}),'');
 for(const habitat of manifest.habitats){
  const bodies=habitat.uids.map(uid=>p2.slotById.get(uid));assert.ok(bodies.length>=2&&bodies.length<=5);
  assert.ok(bodies.every(s=>s.groupId===habitat.groupId&&s.canonicalMobId===habitat.mobId));
  assert.ok(bodies.every(s=>!Number.isInteger(s.x)&&!Number.isInteger(s.z)));
 }
 const weak=staged.filter(s=>['MOB-01','MOB-03'].includes(s.canonicalMobId));
 for(const a of weak)for(const b of weak)if(a.canonicalMobId!==b.canonicalMobId)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=5.5);
 for(const id of ['MOB-01','MOB-03']){
  const bodies=weak.filter(s=>s.canonicalMobId===id);
  for(const a of bodies)for(const b of bodies){
   const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<15||d>40)continue;
   const row=bodies.filter(p=>{const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/d;return t>=-.3&&t<=d+.3&&Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx)/d<.3;});
   assert.ok(row.length<6,'Unnatural straight row: '+row.map(s=>s.uid).join(','));
  }
 }
});

test('P2 preserves terrain, city safe contours, protected roads, services and world revision',()=>{
 assert.equal(p2.revision,legacy.revision);assert.notEqual(p2.mapVersion,legacy.mapVersion);
 assert.ok(p2.mapVersion.includes('starter-v3'));assert.ok(!legacy.mapVersion.includes('starter-v3'));
 assert.deepEqual(p2.layout,legacy.layout);assert.deepEqual(p2.services,legacy.services);
 for(const id of ['surface','mine','great_cave'])assert.deepEqual(p2.spaces[id].terrain.heights,legacy.spaces[id].terrain.heights);
 for(let x=-270;x<=20;x+=5)for(let z=-270;z<=-50;z+=5){
  const q={x,z,spaceId:'surface'};assert.equal(p2.safe(q),legacy.safe(q));assert.equal(p2.safe(q,10),legacy.safe(q,10));
 }
 const outside=staged[0];assert.equal(p2.safe(outside),false);
 assert.ok(inPolygon(outside.x,-outside.z,P2_L02_HUNTING_CONTOUR));
 for(const slot of staged)assert.equal(p2.safe(slot,10+slot.bodyRadius),false,slot.uid);
});

test('every P2 body is clear and connected to actual start; no route/portal/road exclusions were relaxed',()=>{
 const graph=buildAccessGraph(p2,'surface');
 for(const s of staged){
  assert.equal(p2.spaces.surface.collision.isBlocked(s,Math.max(.46,s.bodyRadius)+.25),false,s.uid);
  assert.ok(Number.isFinite(p2.spaces.surface.terrain.supportAt(s.x,s.z)));
  assert.notEqual(graph.nodeFor(s),undefined,s.uid);
  for(const road of p2.layout.roads)assert.ok(roadDistance(s,road)>=road.width/2+2+s.bodyRadius,s.uid);
 }
});

test('territorial pairs have independent perception and no third-group overlap; passive creatures provoke on damage',()=>{
 const wolves=staged.filter(s=>s.canonicalMobId==='MOB-02');
 const groups=new Set(wolves.map(s=>s.groupId));assert.equal(groups.size,13);
 assert.equal([...groups].filter(g=>wolves.filter(s=>s.groupId===g).length===2).length,12);
 for(const a of wolves){
  assert.equal(a.aggroRadius,8);assert.equal(a.behavior.socialAggro,false);
  for(const b of wolves)if(a.groupId!==b.groupId)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=a.aggroRadius+b.aggroRadius+3,a.uid+' / '+b.uid);
 }
 for(const a of staged.filter(s=>s.canonicalMobId!=='MOB-02')){
  assert.equal(a.aggroRadius,0);assert.equal(a.behavior.provocation,'direct-hostile-damage');assert.equal(a.behavior.socialAggro,false);
 }
 for(let i=0;i<staged.length;i++)for(let j=i+1;j<staged.length;j++){
  const a=staged[i],b=staged[j];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=a.bodyRadius+b.bodyRadius+1,a.uid+' / '+b.uid);
 }
});

test('selection retires only explicitly labelled L02 ordinary, preserving bosses even if located there',()=>{
 const ordinary={...legacy.slots.find(s=>!s.boss),uid:'test:old-l02-ordinary',locationId:'L02'};
 const boss={...legacy.slots.find(s=>s.boss),uid:'test:old-l02-boss',locationId:'L02'};
 const selected=selectP2Population([...legacy.slots,ordinary,boss],'starter-v3');
 assert.deepEqual(selected.retiredLegacyUids,[ordinary.uid]);assert.ok(!selected.slots.some(s=>s.uid===ordinary.uid));
 assert.deepEqual(selected.slots.find(s=>s.uid===boss.uid),boss);
 assert.throws(()=>selectP2Population([ordinary,ordinary],'starter-v3'),/duplicate/);
 assert.throws(()=>new FinalWorld(undefined,false,{populationMode:'starter-v3'}),/requires-population/);
});

test('first low-level quests have sufficient targets and connected approaches outside hound perception',()=>{
 const manifest=JSON.parse(readFileSync('docs/world-expansion-v3/P2_POPULATION.json','utf8'));
 const wolves=staged.filter(s=>s.canonicalMobId==='MOB-02'),reserved=JSON.parse(readFileSync('docs/world-expansion-v3/FORTRESS_ACCESS_PATHS.json','utf8')).routes;
 assert.deepEqual(reserved.map(r=>r.uid),manifest.firstQuestSafety.routes.map(r=>r.uid));
 assert.equal(reserved.length,18);
 assert.equal(reserved.filter(r=>p2.slotById.get(r.uid).canonicalMobId==='MOB-01').length,10);
 assert.equal(reserved.filter(r=>p2.slotById.get(r.uid).canonicalMobId==='MOB-03').length,8);
 const collision={isBlocked:(p,r)=>p2.spaces.surface.collision.isBlocked(p,r)||
  (!p2.safe({...p,spaceId:'surface'})&&wolves.some(w=>Math.hypot(p.x-w.x,p.z-w.z)<8+r))};
 for(const route of reserved){
  const s=p2.slotById.get(route.uid);assert.ok(s.level<=3);
  for(const w of wolves)assert.ok(Math.hypot(s.x-w.x,s.z-w.z)>=11);
  assert.equal(route.points[0].x,p2.start.x);assert.equal(route.points[0].z,p2.start.z);
  assert.equal(route.points.at(-1).x,s.x);assert.equal(route.points.at(-1).z,s.z);
  for(let i=1;i<route.points.length;i++)assert.ok(pathSegmentIsClear(collision,route.points[i-1],route.points[i],.46),route.uid);
 }
});

test('QUEST104 sees real living boar packs, while individual damage never implies social aggro',()=>{
 const boars=staged.filter(s=>s.canonicalMobId==='MOB-04'),groups=[...new Set(boars.map(s=>s.groupId))];
 assert.equal(groups.length,22);
 for(const id of groups){
  const members=boars.filter(s=>s.groupId===id);assert.ok(members.length>=2&&members.length<=3);
  for(const a of members){assert.equal(a.behavior.socialAggro,false);assert.equal(a.aggroRadius,0);
   for(const b of members)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<10);}
 }
});

test('persistence remap preserves four boss deaths/timers/rewards and saved P2 wounds; initializes only missing UIDs',()=>{
 const bosses=legacy.slots.filter(s=>s.boss).map((s,i)=>({uid:s.uid,id:s.speciesId,hp:0,alive:false,
  generation:i+7,respawnAt:1000000+i,deathAt:12345,deathRewardGeneration:i+7,customLedger:['paid:'+i]}));
 const wounded={uid:staged[0].uid,id:staged[0].speciesId,hp:31,alive:true,generation:4,respawnAt:0,deathRewardGeneration:3};
 const before=structuredClone([...bosses,wounded]);
 const result=remapP2SavedMonsters(before,p2.populationPlan);
 assert.deepEqual(before,[...bosses,wounded]);assert.deepEqual(result.monsters,before);
 assert.ok(!result.missingSlotUids.includes(wounded.uid));assert.equal(result.archive.length,0);
 assert.ok(result.missingSlotUids.every(uid=>!bosses.some(b=>b.uid===uid)));
 const again=remapP2SavedMonsters(result.monsters,p2.populationPlan,result.archive);assert.deepEqual(again,result);
});

test('disabling and reenabling P2 archives/restores a dead ordinary verbatim without reroll or reward duplication',()=>{
 const dead={uid:staged[0].uid,id:staged[0].speciesId,hp:0,alive:false,generation:9,deathAt:800,
  respawnAt:92000,rewardGrantedFor:9,deathRewardId:'death:'+staged[0].uid+':9'};
 const legacyMob={uid:legacy.slots[0].uid,id:legacy.slots[0].speciesId,hp:24,alive:true,generation:3};
 const off=remapP2SavedMonsters([legacyMob,dead],legacy.populationPlan);
 assert.deepEqual(off.monsters,[legacyMob]);assert.equal(off.archive.length,1);assert.deepEqual(off.archive[0].monster,dead);
 const on=remapP2SavedMonsters(off.monsters,p2.populationPlan,off.archive);
 assert.deepEqual(on.monsters.find(m=>m.uid===dead.uid),dead);assert.equal(on.archive.length,0);assert.deepEqual(on.restoredUids,[dead.uid]);
 assert.ok(!on.missingSlotUids.includes(dead.uid));
 const again=remapP2SavedMonsters(on.monsters,p2.populationPlan,on.archive);
 assert.deepEqual(again.monsters,on.monsters);assert.deepEqual(again.restoredUids,[]);
});

test('habitat relayout moves only idle living bodies, preserves wounds/deaths and leaves engaged bodies until return',()=>{
 const slots=staged.slice(0,3),records=slots.map((s,i)=>({uid:s.uid,id:s.speciesId,home:{x:s.x+4,z:s.z+3,spaceId:'surface'},x:s.x+4,z:s.z+3,spaceId:'surface',
  hp:i===2?0:31,alive:i!==2,generation:8,respawnAt:i===2?90000:0,status:{stun:2300,dot:7000},
  action:i===1?'attack':i===2?'death':'idle',combatState:i===1?'windup':i===2?'dead':'idle',targetId:i===1?'hero':null}));
 const before=structuredClone(records),result=remapP2SavedMonsters(records,p2.populationPlan);
 assert.deepEqual(records,before);assert.deepEqual(result.relocatedUids,[slots[0].uid]);
 for(let i=0;i<3;i++){
  const actual=result.monsters[i];assert.equal(actual.hp,before[i].hp);assert.equal(actual.generation,8);assert.deepEqual(actual.status,before[i].status);assert.equal(actual.respawnAt,before[i].respawnAt);
  assert.deepEqual(actual.home,{x:slots[i].x,z:slots[i].z,spaceId:'surface'});
  assert.equal(actual.x,i===0?slots[i].x:before[i].x);assert.equal(actual.z,i===0?slots[i].z:before[i].z);
 }
 assert.deepEqual(remapP2SavedMonsters(result.monsters,p2.populationPlan).relocatedUids,[]);
});
