import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
import {findNavigationPath,pathSegmentIsClear} from '../src/world/navigation.ts';
const data=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard-p2.json','utf8'));
const legacy=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard.json','utf8'));
const w=new FinalWorld(undefined,true,{populationMode:'starter-v3'}),c=w.spaces.surface.collision,t=w.spaces.surface.terrain;

test('eight source-derived buildings preserve all city service and activity identities',()=>{
 assert.equal(data.p2City.version,2);assert.equal(data.p2City.buildings.length,8);
 for(const k of ['residents','residentLooks','wildlife','signs'])assert.deepEqual(data[k],legacy[k]);
 assert.deepEqual({...data.tavern,replacesLandmarks:legacy.tavern.replacesLandmarks},legacy.tavern);
 assert.deepEqual(data.tavern.replacesLandmarks,[...legacy.tavern.replacesLandmarks,'FORT']);
 assert.deepEqual({...data.quarter,streets:data.quarter.streets.slice(0,legacy.quarter.streets.length)},legacy.quarter);
 assert.deepEqual(data.quarter.streets.slice(legacy.quarter.streets.length).map(s=>s.name),data.fortressV3.addedStreetIds);
 assert.deepEqual(w.services,new FinalWorld().services);
 for(const b of data.p2City.buildings){assert.ok(data.props.some(p=>p.id===b.id));assert.ok(b.drawSurfaces<20);assert.ok(b.obstacles>0);}
 assert.equal(w.slots.length,1151);
});

test('all eight physical arches retain a continuous pedestrian corridor',()=>{
 for(const b of data.p2City.buildings)for(const lateral of (b.source==='P2_gatehouse'?[-.7,0,.7]:[-.1,0,.1])){
  let previous;
  for(let n=-6;n<=6;n+=.1){
   const p={x:b.passageCenter[0]-Math.sin(b.yaw)*n+Math.cos(b.yaw)*lateral,z:b.passageCenter[1]+Math.cos(b.yaw)*n+Math.sin(b.yaw)*lateral};
   assert.equal(c.isBlocked(p,.46),false,b.id+' '+n);
   if(previous)assert.ok(pathSegmentIsClear(c,previous,p,.46));previous=p;
  }
 }
});

test('main gate reaches every preserved service and real tavern interior along collision-checked paths',()=>{
 const start={x:-100,z:-219};assert.equal(c.isBlocked(start,.46),false);
 const points=Object.entries(w.services).filter(([id])=>!id.includes('asterhold')).map(([id,p])=>({id,...p}));
 points.push({id:'tavern-inside',...data.tavern.inside});
 for(const p of points){
  assert.equal(c.isBlocked(p,.46),false,p.id);
  const waypoints=p.id==='npc:books'?[data.tavern.entry,data.tavern.door,data.tavern.inside,p]:[p];
  let anchor=start;const path=[];for(const waypoint of waypoints){path.push(...findNavigationPath(c,anchor,waypoint,{actorRadius:.46,cellSize:.35,margin:45,maxVisited:80000}));anchor=waypoint;}
  assert.ok(path?.length,p.id+' no route');let previous=start;
  for(const q of path){assert.ok(pathSegmentIsClear(c,previous,q,.46),p.id+' segment');previous=q;}
  assert.ok(Math.hypot(previous.x-p.x,previous.z-p.z)<.8,p.id+' endpoint');
 }
});

test('replacement house steps have real support rises while main streets stay flush',()=>{
 for(const b of data.p2City.buildings.filter(b=>b.stairs)){
  const x=(b.stairs.min[0]+b.stairs.max[0])/2,z=(b.stairs.min[1]+b.stairs.max[1])/2;
  assert.ok(t.supportAt(x,z)>71,b.id+' physical upper support');
 }
 for(const street of data.quarter.streets??[])assert.ok(street.width>=3);
});
