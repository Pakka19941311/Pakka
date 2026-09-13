import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {makeRouteContext,runQuestRoutes} from '../../../world_expansion_v3/p2-quest-routes.mjs';
import {pathSegmentIsClear} from '../../../../src/world/navigation.ts';
const context=makeRouteContext();
const before=JSON.parse(readFileSync('docs/world-expansion-v3/P2_POPULATION.json','utf8'));
const routes=before.firstQuestSafety.routes.map(r=>({uid:r.uid,points:context.graph.pathTo(context.geography.slotById.get(r.uid))}));
for(const route of routes){
 assert.ok(route.points.length>1,route.uid);
 assert.deepEqual(route.points[0],{x:context.geography.start.x,z:context.geography.start.z});
 for(let i=1;i<route.points.length;i++)assert.ok(pathSegmentIsClear(context.collision,route.points[i-1],route.points[i],.46),route.uid+':'+i);
}
writeFileSync('docs/world-expansion-v3/FORTRESS_ACCESS_PATHS.json',JSON.stringify({mapVersion:context.geography.mapVersion,method:'Actual navigation through the new gate; original spawn UIDs/targets and hound exclusion preserved',routes},null,2)+'\n');
const report=runQuestRoutes({traceEveryPhysicsTick:true});
report.traceIntervalMs=1000/60;
report.mapVersion=context.geography.mapVersion;
report.movementSegments=report.results.reduce((n,r)=>n+Math.max(0,(r.movementTrace?.length??1)-1),0);
writeFileSync('docs/world-expansion-v3/FORTRESS_QUEST_ROUTES.json',JSON.stringify(report,null,2)+'\n');
assert.ok(report.results.length===3&&report.results.every(r=>r.ok),JSON.stringify(report.results.filter(r=>!r.ok)));
console.log(JSON.stringify({ok:true,routes:routes.length,movementSegments:report.movementSegments}));
