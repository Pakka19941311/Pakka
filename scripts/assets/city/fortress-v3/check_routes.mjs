import {readFileSync,writeFileSync,mkdirSync,cpSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FinalWorld} from '../../../../src/world/final-world.ts';
import {findNavigationPath,pathSegmentIsClear} from '../../../../src/world/navigation.ts';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const candidate=resolve(repo,'work/qa/fortress-v3/candidate');
const stage=resolve(repo,'work/qa/fortress-v3/collision-stage');mkdirSync(stage,{recursive:true});
cpSync(resolve(repo,'godot-pc/world-final'),stage,{recursive:true,filter:p=>statSync(p).isDirectory()||/\.(json|f32)$/.test(p)});
cpSync(resolve(candidate,'courtyard.json'),resolve(stage,'castle/courtyard-p2.json'));
const data=JSON.parse(readFileSync(resolve(candidate,'courtyard.json'),'utf8'));
const baseline=JSON.parse(readFileSync(resolve(repo,'art/city-fortress-v3/baseline-courtyard.json'),'utf8'));
const w=new FinalWorld(stage,true,{populationMode:'starter-v3'}),old=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const collision=w.spaces.surface.collision,terrain=w.spaces.surface.terrain;const checks=[],routes=[];
function check(id,passed,detail={}){checks.push({id,passed,...detail});if(!passed)console.error('FAIL',id,JSON.stringify(detail));}
for(const key of ['residents','residentLooks','wildlife','signs'])check('immutable-'+key,JSON.stringify(data[key])===JSON.stringify(baseline[key]));
const tavern={...data.tavern,replacesLandmarks:baseline.tavern.replacesLandmarks};check('immutable-tavern',JSON.stringify(tavern)===JSON.stringify(baseline.tavern));
check('13-service-anchors',Object.keys(w.services).length===13&&JSON.stringify(w.services)===JSON.stringify(old.services));
check('39-residents',data.residents.length===39&&new Set(data.residents.map(r=>r.seed)).size===39);
check('5-animals',data.wildlife.length===5);
check('population-unchanged',JSON.stringify(w.slots)===JSON.stringify(old.slots));
function walk(id,from,to,radius=.46){
 if(collision.isBlocked(from,radius)||collision.isBlocked(to,radius)){check(id,false,{from,to,blockedStart:collision.isBlocked(from,radius),blockedEnd:collision.isBlocked(to,radius)});return;}
 const before=performance.now();const path=findNavigationPath(collision,from,to,{actorRadius:radius,cellSize:.55,margin:28,maxVisited:75000});let prev=from,clear=!!path.length;
 for(const next of path){if(!pathSegmentIsClear(collision,prev,next,radius)){clear=false;break;}prev=next;}
 const reached=Math.hypot(prev.x-to.x,prev.z-to.z)<.65;check(id,clear&&reached,{points:path.length,ms:performance.now()-before});routes.push({id,from,to,path,passed:clear&&reached});
}
const gate={x:-100,z:-238};
for(const lateral of [-2.6,0,2.6]){let prev={x:-100+lateral,z:-238},ok=true;for(let z=-237.9;z<=-208;z+=.1){const p={x:-100+lateral,z};ok&&=!collision.isBlocked(p,.46)&&pathSegmentIsClear(collision,prev,p,.46);prev=p;}check('gate-lateral-'+lateral,ok);}
for(const [id,p]of Object.entries(w.services).filter(([id])=>!id.includes('asterhold')))walk('service-'+id,gate,p);
walk('tavern-door',gate,data.tavern.entry);walk('tavern-interior',data.tavern.entry,data.tavern.inside);walk('books',data.tavern.inside,w.services['npc:books']);
for(const r of data.residents)for(let i=0;i<r.route.length;i++)walk('resident-'+r.seed+'-'+i,r.route[i],r.route[(i+1)%r.route.length],.42);
for(const [i,a]of data.wildlife.entries())check('animal-'+i,!collision.isBlocked(a,.3));
walk('citadel-ascent',gate,{x:-100,z:-116});walk('citadel-west-gate',{x:-100,z:-116},{x:-136,z:-104});walk('citadel-east-gate',{x:-100,z:-116},{x:-66,z:-101});
const rampSamples=[];let maximumError=0;
for(const x of [-105,-100,-95])for(let z=-148;z<=-123;z+=.25){const expected=70.14+4.2*(z+148)/25,actual=terrain.supportAt(x,z);maximumError=Math.max(maximumError,Math.abs(expected-actual));rampSamples.push({x,z,expected,actual});}
check('ramp-physical-height',maximumError<.00005,{maximumError});
for(const z of [-148,-123])check('ramp-seam-'+z,Math.abs(terrain.supportAt(-100,z-.01)-terrain.supportAt(-100,z+.01))<.01);
check('ramp-slope',Math.atan(4.2/25)*180/Math.PI<10);
const report={ok:checks.every(r=>r.passed),checks,passed:checks.filter(r=>r.passed).length,total:checks.length,routes,mapVersion:w.mapVersion,source:'actual FinalWorld collision+terrain loaded from staged candidate JSON, no production replacement',rampSamples};
writeFileSync(resolve(candidate,'route-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,total:report.total,failures:checks.filter(c=>!c.passed),mapVersion:w.mapVersion}));process.exitCode=report.ok?0:2;
