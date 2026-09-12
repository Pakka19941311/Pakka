import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {FinalWorld} from '../../src/world/final-world.ts';
import {findNavigationPath,pathSegmentIsClear} from '../../src/world/navigation.ts';
const world=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const space=world.spaces.surface,checks={},routes=[];
const check=(name,truth)=>{checks[name]=Boolean(truth);assert.ok(truth,name);};
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const manifest=json('art/terrain-lake-p2-v3/manifest.json');
let vertices=0,error=0;
for(const cell of manifest.changed_chunks){
 const bytes=readFileSync('godot-pc/world-final/geology-D13/'+cell.glb),length=bytes.readUInt32LE(12),glb=JSON.parse(bytes.subarray(20,20+length).toString());
 const primitive=glb.meshes[0].primitives[0],accessor=glb.accessors[primitive.attributes.POSITION],view=glb.bufferViews[accessor.bufferView];
 const offset=28+length+(view.byteOffset??0)+(accessor.byteOffset??0);
 for(let i=0;i<accessor.count;i++){
  const x=bytes.readFloatLE(offset+i*12),y=bytes.readFloatLE(offset+i*12+4),z=bytes.readFloatLE(offset+i*12+8);
  error=Math.max(error,Math.abs(y-space.terrain.heightAt(x,-z)));vertices++;
 }
}
check('all_changed_render_vertices_equal_authoritative_height',error===0);
check('irregular_boundary_140_points',world.layout.water.lake.polygon.length===140);
check('three_actual_islets',manifest.islets.length===3);
for(const island of manifest.islets)check(island.id+'_walkable_above_water',space.terrain.heightAt(island.x,-island.z)>42&&!space.collision.isBlocked({x:island.x,z:-island.z},.46));
for(const [x,z] of [[130,-105],[270,-110],[175,-175],[305,-30]])check('water_blocked_'+x+'_'+z,space.collision.isBlocked({x,z:-z},.46));
for(const [id,a,b] of [['new_pier_from_existing_road',[190,145],[100,-30]],['retained_east_pier',[380,25],[326,25]]]){
 const start={x:a[0],z:-a[1]},goal={x:b[0],z:-b[1]};
 check(id+'_endpoints_free',!space.collision.isBlocked(start,.46)&&!space.collision.isBlocked(goal,.46));
 const path=findNavigationPath(space.collision,start,goal,{actorRadius:.46,margin:35,maxVisited:20000});
 check(id+'_route_found',path.length>0&&Math.hypot(path.at(-1).x-goal.x,path.at(-1).z-goal.z)<.01);
 let anchor=start;for(const point of path){check(id+'_segment_'+routes.length+'_'+path.indexOf(point),pathSegmentIsClear(space.collision,anchor,point,.46));anchor=point;}
 routes.push({id,start,goal,path});
}
for(const x of [99.15,100,100.85]){
 const start={x,z:-6},end={x,z:30};check('pier_center_and_offset_'+x,pathSegmentIsClear(space.collision,start,end,.46));
}
const report={ok:true,checks,renderVerticesCompared:vertices,maximumHeightError:error,mapVersion:world.mapVersion,routes,limitations:'Isolated geometry and authoritative navigation; no claim of full gameplay frame-rate acceptance.'};
writeFileSync('art/terrain-lake-p2-v3/geometry-check.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
