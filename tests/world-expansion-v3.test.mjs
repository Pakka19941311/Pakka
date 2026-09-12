import test from 'node:test';
import {historicalFingerprintMatches,recordUnresolvedHistoricalSource} from './helpers/historical-fingerprint.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {FinalWorld,inPolygon,segmentGap} from '../src/world/final-world.ts';
import {pathSegmentIsClear} from '../src/world/navigation.ts';
import {WORLD_V3_LOCATION_COUNTS,MOBS_V3,HUNTING_ZONES_V3,MINI_BOSSES_V3,
 MAJOR_BOSSES_V3,layoutToRuntime,runtimeToLayout,mobV3} from '../src/data/world-expansion-v3.ts';
import {SAFE_CORES,inZone,locationPolygon} from '../scripts/world_expansion_v3/spatial.mjs';
import {buildAccessGraph} from '../scripts/world_expansion_v3/access-graph.mjs';
const json=name=>JSON.parse(readFileSync(resolve('docs/world-expansion-v3',name),'utf8'));
const population=json('population.json'),layout=json('hunting-layout.json'),migration=json('migration.json');
const world=new FinalWorld(undefined,false),slots=population.slots,ordinary=slots.filter(s=>s.kind==='ordinary');
const count=(items,key)=>Object.fromEntries([...new Set(items.map(s=>s[key]))].sort().map(id=>[id,items.filter(s=>s[key]===id).length]));

test('accepted V3 identities: 48 ordinary, 30 zones, 12 original locations, independent boss registries',()=>{
 assert.equal(MOBS_V3.length,48);assert.equal(new Set(MOBS_V3.map(m=>m.id)).size,48);
 assert.equal(new Set(MOBS_V3.map(m=>m.speciesId)).size,48);
 assert.equal(HUNTING_ZONES_V3.length,30);
 assert.deepEqual(count(ordinary,'locationId'),WORLD_V3_LOCATION_COUNTS);
 assert.deepEqual(count(slots,'kind'),{major:4,mini:12,ordinary:2400});
 assert.deepEqual(count(slots,'spaceId'),{great_cave:162,mine:121,surface:2133});
 assert.equal(new Set(slots.map(s=>s.uid)).size,2416);
 assert.equal(new Set(MOBS_V3.filter(m=>m.legacySpeciesId).map(m=>m.legacySpeciesId)).size,12);
 assert.equal(mobV3('MOB-01').speciesId,'spider');
 assert.notEqual(mobV3('MOB-06').speciesId,'spider');
 assert.equal(MAJOR_BOSSES_V3.find(b=>b.speciesId==='mini').locationId,'L04');
});

test('slot quotas, fixed levels and five Greenfall starting species match the contract',()=>{
 for(const zone of HUNTING_ZONES_V3){
  const members=ordinary.filter(s=>s.subzoneId===zone.id);
  assert.equal(members.length,zone.counts.reduce((n,c)=>n+c.count,0),zone.id);
  for(const quota of zone.counts)assert.equal(members.filter(s=>s.mobId===quota.mobId).length,quota.count,zone.id+'/'+quota.mobId);
 }
 for(const slot of ordinary){
  const [low,high]=mobV3(slot.mobId).levelBand;
  assert.ok(Number.isInteger(slot.level)&&slot.level>=low&&slot.level<=high,slot.uid);
 }
 const start=ordinary.filter(s=>s.locationId==='L02');
 assert.deepEqual([...new Set(start.map(s=>s.mobId))].sort(),['MOB-01','MOB-02','MOB-03','MOB-04','MOB-05']);
 assert.ok(start.every(s=>s.level<10));
 assert.ok(ordinary.filter(s=>['MOB-35','MOB-39'].includes(s.mobId)).every(s=>s.level>=58));
 assert.ok(new Set(ordinary.filter(s=>s.locationId==='L03').map(s=>s.level)).size>20);
});

test('exactly one new mini per original L; accepted cave boss identity/level remain intact',()=>{
 const minis=slots.filter(s=>s.kind==='mini');
 assert.deepEqual(count(minis,'locationId'),Object.fromEntries(Object.keys(WORLD_V3_LOCATION_COUNTS).map(id=>[id,1])));
 assert.equal(MINI_BOSSES_V3.length,12);
 assert.ok(MINI_BOSSES_V3.every(b=>b.respawn.min===30&&b.respawn.max===75&&b.respawn.sample==='once-after-death'&&b.respawn.persistDeadline));
 const cave=slots.find(s=>s.speciesId==='cave_boss');
 assert.deepEqual([cave.uid,cave.level,cave.spaceId,cave.x,cave.z],['wf:great_cave:cave_boss:000',40,'great_cave',20,100]);
 assert.notEqual(minis.find(s=>s.locationId==='L07').uid,cave.uid);
});

test('staged proposal retains historical fingerprints; current spatial compatibility is tested below',()=>{
 const audit='docs/world-expansion-v3/audit-20260912/resources/';
 const ledger=JSON.parse(readFileSync(audit+'historical-evidence-ledger.json','utf8'));
 const provenance=JSON.parse(readFileSync(audit+'proposal-provenance.json','utf8'));
 assert.ok(historicalFingerprintMatches('docs/world-expansion-v3/population.json',ledger.reports['docs/world-expansion-v3/population.json'].sha256LF));
 assert.equal(population.activation.runtimeEnabled,false);
 for(const source of population.source){
  if(recordUnresolvedHistoricalSource(source.path,source.sha256))continue;
  const recorded=provenance.find(row=>row.path===source.path);
  assert.equal(recorded.recordedSha256,source.sha256);
  if(recorded.status==='historical-archive-verified'){
   // The accepted lake keeps its original geography in a pinned ZIP. The
   // independent audit compared each extracted entry with these original pins.
   const lake=JSON.parse(readFileSync('art/terrain-lake-p2-v3/manifest.json','utf8'));
   assert.equal(createHash('sha256').update(readFileSync(recorded.archive)).digest('hex'),lake.baseline_zip_sha256);
  }else assert.ok(historicalFingerprintMatches(source.path,source.sha256),source.path+' changed: update provenance and spatially review');
 }
});

test('new L02 outskirts preserve location identity, world bounds and separation from neighboring locations',()=>{
 const old=world.layout.locations.find(l=>l.id==='L02').outline_xz,newPoly=locationPolygon(world,'L02');
 assert.notDeepEqual(newPoly,old);
 for(const [x,z] of newPoly)assert.ok(Math.abs(x)<=800&&Math.abs(z)<=700);
 // Scan the ADDED strip rather than prohibiting historical overlapping contours elsewhere.
 for(let x=-270;x<20;x+=2)for(let z=50;z<270;z+=2){
  if(!inPolygon(x,z,newPoly)||inPolygon(x,z,old))continue;
  assert.ok(!world.layout.locations.filter(l=>l.id!=='L02').some(l=>inPolygon(x,z,l.outline_xz)),x+','+z+' overlaps a neighboring original location');
 }
 assert.ok(layout.locations.find(l=>l.id==='L02').boundaryChanged);
});

test('all slots use correct coordinates, actual heights, collision clearance and authorized hunting geometry',()=>{
 for(const slot of slots){
  assert.deepEqual(layoutToRuntime(slot.layoutXZ),{x:slot.x,z:slot.z});
  assert.deepEqual(runtimeToLayout(slot),slot.layoutXZ);
  const space=world.spaces[slot.spaceId],height=space.terrain.supportAt(slot.x,slot.z);
  assert.ok(Number.isFinite(height)&&Math.abs(height-slot.y)<=.000501,slot.uid+' height');
  assert.equal(space.collision.isBlocked(slot,slot.actorRadius+.25),false,slot.uid+' collision/water/slope');
  if(slot.kind==='ordinary'){
   const zone=HUNTING_ZONES_V3.find(z=>z.id===slot.subzoneId);
   assert.ok(inZone(world,zone,slot),slot.uid+' hunting geometry');
  }
  if(slot.spaceId==='surface')assert.ok(inPolygon(slot.x,-slot.z,locationPolygon(world,slot.locationId)),slot.uid+' location');
 }
 // Reject meaningful negatives: actual lake and existing castle wall are not
 // validated merely because a point fits an administrative polygon.
 assert.equal(world.spaces.surface.collision.isBlocked({x:220,z:70},.46),true);
});

test('cities, services, protected road and portal transit buffers contain no hostile slots',()=>{
 for(const slot of slots){
  if(slot.spaceId!=='surface'){
   assert.ok(Math.hypot(slot.x,slot.z)>=48+slot.actorRadius,slot.uid+' portal buffer');continue;
  }
  const x=slot.x,z=-slot.z,margin=10+slot.actorRadius;
  for(const core of SAFE_CORES){
   assert.equal(inPolygon(x,z,core.polygon),false,slot.uid+' in safe core');
   assert.ok(core.polygon.every((a,i)=>segmentGap(x,z,a,core.polygon[(i+1)%core.polygon.length])>margin),slot.uid+' safe core buffer');
  }
  for(const road of world.layout.roads.filter(r=>r.kind==='protected')){
   for(let i=1;i<road.points_xyz.length;i++){
    const a=road.points_xyz[i-1],b=road.points_xyz[i];
    assert.ok(segmentGap(x,z,[a[0],a[2]],[b[0],b[2]])>road.width/2+3+margin,slot.uid+' protected road');
   }
  }
  for(const service of Object.values(world.services))assert.ok(Math.hypot(slot.x-service.x,slot.z-service.z)>18+slot.actorRadius,slot.uid+' service buffer');
 }
});

test('spawn bodies do not intersect and ordinary slots leave the reserved boss pockets empty',()=>{
 for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){
  const a=slots[i],b=slots[j];if(a.spaceId!==b.spaceId)continue;
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=a.actorRadius+b.actorRadius+.399,a.uid+' / '+b.uid);
 }
 for(const arena of layout.arenas)for(const slot of ordinary.filter(s=>s.spaceId===arena.spaceId)){
  assert.ok(Math.hypot(slot.x-arena.x,slot.z-arena.z)>=arena.radius+2,slot.uid+' boss pocket');
 }
});

test('every spawn connects to the real start/portal; stored routes replay against current collision',()=>{
 for(const spaceId of ['surface','mine','great_cave']){
  const graph=buildAccessGraph(world,spaceId);
  for(const slot of slots.filter(s=>s.spaceId===spaceId))assert.notEqual(graph.nodeFor(slot),undefined,slot.uid+' disconnected');
  for(const route of layout.routes.filter(r=>r.spaceId===spaceId)){
   assert.deepEqual({x:route.path[0].x,z:route.path[0].z},graph.start);
   for(let i=1;i<route.path.length;i++)assert.ok(pathSegmentIsClear(world.spaces[spaceId].collision,route.path[i-1],route.path[i],.46),route.id+' edge '+i);
  }
 }
 assert.equal(layout.routes.length,30);
 assert.equal(layout.portals.length,2);
 for(const portal of layout.portals){
  assert.equal(world.spaces.surface.collision.isBlocked(portal.surface,.46),false,portal.id+' entrance');
  for(let i=1;i<portal.surfaceRoute.length;i++)assert.ok(pathSegmentIsClear(world.spaces.surface.collision,portal.surfaceRoute[i-1],portal.surfaceRoute[i],.46),portal.id+' approach '+i);
 }
});

test('migration is explicit dry-run data and cannot activate fallback entities or duplicate boss deaths',()=>{
 assert.equal(population.activation.runtimeEnabled,false);
 assert.ok(slots.every(s=>s.runtimeEnabled===false));
 assert.equal(migration.mode,'dry-run-only');assert.equal(migration.legacyCount,1001);
 assert.equal(new Set(migration.mapping.map(m=>m.oldUid)).size,1001);
 assert.equal(migration.newCount,2416);
 assert.equal(migration.mapping.filter(m=>m.action==='retire-slot-preserve-audit').length,997);
 assert.equal(migration.mapping.find(m=>m.speciesId==='cave_boss').newUid,'wf:great_cave:cave_boss:000');
 const live=JSON.parse(readFileSync('godot-pc/world-final/gameplay/spawn-manifest.json','utf8'));
 assert.equal((live.slots??live).length,1000);
 assert.ok((live.slots??live).every(s=>!s.uid.startsWith('wv3:')));
});
