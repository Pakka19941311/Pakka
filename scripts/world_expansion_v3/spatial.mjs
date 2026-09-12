import {inPolygon,segmentGap} from '../../src/world/final-world.ts';
import {HUNTING_ZONES_V3,SURFACE_LOCATION_OVERRIDES_V3,runtimeToLayout} from '../../src/data/world-expansion-v3.ts';

/** Authored safe cores, layout XZ metres. No change to runtime FinalWorld.safe.
 * Castle core includes the entire original 166x148 m fortress, all walls/quarters.
 * Village core encloses all nine authored buildings and current service points.
 */
export const SAFE_CORES = [
 {id:'L01-town-core',locationId:'L01',polygon:[[-540,279],[-443,274],[-414,335],[-414,359],[-462,382],[-540,381]]},
 {id:'L02-fortress-core',locationId:'L02',polygon:[[-187,72],[-13,72],[-13,228],[-187,228]]},
 {id:'L06-shore-settlement',locationId:'L06',polygon:[[362,0],[492,0],[492,114],[362,114]]},
];
export const HERO_RADIUS=.46;
export const ROAD_EMPTY_MARGIN=2;
export const CORE_SPAWN_MARGIN=10;
export const INTERIOR_ENTRY_EMPTY_DISTANCE=38;

export function polygonDistance(x,z,polygon) {
 if(inPolygon(x,z,polygon)) return 0;
 return Math.min(...polygon.map((a,i)=>segmentGap(x,z,a,polygon[(i+1)%polygon.length])));
}
export function safeAt(world,p,margin=0) {
 if(p.spaceId!=='surface') return Math.hypot(p.x,p.z)<INTERIOR_ENTRY_EMPTY_DISTANCE+margin;
 const [x,z]=runtimeToLayout(p);
 if(SAFE_CORES.some(core=>polygonDistance(x,z,core.polygon)<=margin))return true;
 if(Object.values(world.services).some(s=>Math.hypot(x-s.x,z+s.z)<8+margin)) return true;
 return world.layout.roads.filter(r=>r.kind==='protected').some(r=>roadDistance(p,r)<=r.width/2+3+margin);
}
export function roadDistance(p,road) {
 const [x,z]=runtimeToLayout(p);
 return Math.min(...road.points_xyz.slice(1).map((b,i)=>{
  const a=road.points_xyz[i];return segmentGap(x,z,[a[0],a[2]],[b[0],b[2]]);
 }));
}
export function locationPolygon(world,id) {
 const loc=world.layout.locations.find(l=>l.id===id);
 if(!loc)throw Error('Unknown location '+id);
 return SURFACE_LOCATION_OVERRIDES_V3[id]??loc.outline_xz;
}
export function inZone(world,zone,p) {
 if(p.spaceId!==zone.spaceId)return false;
 const [x,z]=runtimeToLayout(p);
 if(zone.spaceId!=='surface') {
  // Hunting uses chambers; corridor strips remain empty transit space.
  if(!world.spaces[zone.spaceId].definition.rooms.some(r=>
   ((x-r.center[0])/r.radii[0])**2+((z-r.center[1])/r.radii[1])**2 < .83))return false;
  if(zone.locationId==='L07')return zone.id==='L07-A'?z>-210:z<=-210;
  return true;
 }
 if(!inPolygon(x,z,locationPolygon(world,zone.locationId)))return false;
 if(zone.locationId==='L03') {
  const mask=world.layout.masks.find(m=>m.id===(zone.id==='L03-C'?'rotten_forest':'living_forest')).polygon;
  return inPolygon(x,z,mask)&&(zone.id==='L03-C'||(zone.id==='L03-A'?z>-70:z<=-70));
 }
 const peers=HUNTING_ZONES_V3.filter(s=>s.locationId===zone.locationId&&s.spaceId===zone.spaceId);
 const distance=s=>(x-s.anchorLayout[0])**2+(z-s.anchorLayout[1])**2;
 return peers.every(s=>distance(zone)<=distance(s)+1e-8);
}
export function eligible(world,zone,p,radius=.46) {
 if(!inZone(world,zone,p)||safeAt(world,p,CORE_SPAWN_MARGIN+radius))return false;
 const space=world.spaces[p.spaceId];
 if(space.collision.isBlocked(p,radius+.25))return false;
 if(p.spaceId==='surface'&&world.layout.roads.some(r=>roadDistance(p,r)<r.width/2+ROAD_EMPTY_MARGIN+radius))return false;
 return Number.isFinite(space.terrain.supportAt(p.x,p.z));
}
