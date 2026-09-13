import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld} from '../src/world/final-world.ts';
import {CollisionWorld} from '../src/world/collision-world.ts';
import {pathSegmentIsClear} from '../src/world/navigation.ts';
const json=p=>JSON.parse(readFileSync(p,'utf8')),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const before=json('art/p2-nature-sample-v3/integration-baseline.json').worlds;
const legacy=new FinalWorld(),p2=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const obstacles=json('godot-pc/world-final/nature/p2-sample-v3/collision.json').obstacles;
// Preserve the old 659-segment report as historical evidence. The rebuilt walls
// require a fresh real-command route through the gate, with the same quest goals.
const currentRoutes=json('docs/world-expansion-v3/FORTRESS_QUEST_ROUTES.json');
const routes=currentRoutes.results;

test('nature integration preserves both populations and services on the shared accepted lake geography',()=>{
 // The retained integration baseline predates the separately accepted lake.
 // Its source/map hashes are historical; require current legacy/P2 geography
 // equality and unchanged populations/services rather than undoing that lake.
 assert.notEqual(legacy.mapVersion,before.legacy.mapVersion);
 assert.equal(legacy.natureSamplePath,null);
 assert.deepEqual(p2.layout,legacy.layout);
 for(const w of [legacy,p2]){
  const baseline=before[w.populationMode];assert.equal(w.slots.length,baseline.slots);assert.equal(hash(w.slots),baseline.slotsHash);assert.equal(hash(w.services),baseline.servicesHash);
  for(const [id,space] of Object.entries(w.spaces)){
   const digest=createHash('sha256').update(new Uint8Array(space.terrain.heights.buffer)).digest('hex');
   const current=createHash('sha256').update(new Uint8Array(legacy.spaces[id].terrain.heights.buffer)).digest('hex');
   assert.equal(digest,current,id);
   if(id!=='surface')assert.equal(digest,baseline.terrainHashes[id]);
  }
  for(const sample of baseline.safeSamples)assert.equal(w.safe({...sample,spaceId:'surface'}),sample.safe);
 }
});

test('P2 loads the exact shared collider data and changes the map version',()=>{
 assert.equal(p2.natureSamplePath,'nature/p2-sample-v3/collision.json');assert.notEqual(p2.mapVersion,before['starter-v3'].mapVersion);
 const expected=new CollisionWorld();
 for(const o of obstacles)o.kind==='circle'?expected.addCircle(o.x,o.z,o.radius,o.bottom,o.top):expected.addBox(o.x,o.z,o.halfX,o.halfZ,o.rotation,o.bottom,o.top);
 assert.equal(obstacles.length,66);assert.deepEqual(p2.spaces.surface.collision.manifest().slice(-66),expected.manifest());
});

test('a new P2 trunk blocks walking, combat LOS and camera while preserving air above it',()=>{
 const o=obstacles.find(o=>o.id==='P2N_tree_000'),collision=p2.spaces.surface.collision;
 assert.equal(legacy.spaces.surface.collision.isBlocked(o,.46),false);assert.equal(collision.isBlocked(o,.46),true);
 const y=o.bottom+1.5,a={x:o.x-o.radius-1,z:o.z,y},b={x:o.x+o.radius+1,z:o.z,y},length=b.x-a.x;
 assert.equal(legacy.spaces.surface.collision.hasLineOfSight(a,b,.04),true);
 assert.equal(collision.hasLineOfSight(a,b,.04),false);assert.ok(collision.cameraDistance(a,b,.22)<length);
 assert.equal(collision.hasLineOfSight({...a,y:o.top+1},{...b,y:o.top+1},.04),true);
});

test('all 150 real P2 spawn positions remain free with the integrated collision',()=>{
 const slots=p2.slots.filter(s=>s.canonicalMobId);assert.equal(slots.length,150);
 for(const s of slots)assert.equal(p2.spaces.surface.collision.isBlocked(s,Math.max(.46,s.bodyRadius??0)),false,s.uid);
});

test('all physics-tick rebuilt-fortress quest trace segments and the 5m passage remain open',()=>{
 assert.equal(routes.length,3);assert.ok(routes.every(r=>r.ok&&!r.fixtureCompletion));
 assert.equal(currentRoutes.mapVersion,p2.mapVersion);
 let count=0;
 for(const route of routes)for(let i=1;i<route.movementTrace.length;i++){
  assert.equal(pathSegmentIsClear(p2.spaces.surface.collision,route.movementTrace[i-1],route.movementTrace[i],.46),true,route.name+' segment '+i);count++;
 }
 assert.equal(count,currentRoutes.movementSegments);assert.ok(count>30000);
 assert.equal(currentRoutes.traceIntervalMs,1000/60);
 assert.equal(pathSegmentIsClear(p2.spaces.surface.collision,{x:-263,z:-228},{x:-263,z:-180},2.5),true);
 assert.equal(p2.spaces.surface.collision.isBlocked({x:-263,z:-204},4.5),false);
});

test('mine and cave collision stay unchanged and shoreline water remains inaccessible',()=>{
 for(const id of ['mine','great_cave'])assert.deepEqual(p2.spaces[id].collision.manifest(),legacy.spaces[id].collision.manifest());
 for(const point of [{x:-30,z:70},{x:-22,z:60}]){
  assert.equal(legacy.spaces.surface.collision.isBlocked(point,.46),true);
  assert.equal(p2.spaces.surface.collision.isBlocked(point,.46),true);
 }
});
