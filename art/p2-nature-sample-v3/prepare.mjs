/** Read the actual P2 terrain/collision. Writes only this isolated candidate. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld} from '../../src/world/final-world.ts';
import {CollisionWorld} from '../../src/world/collision-world.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
const out='art/p2-nature-sample-v3/',nature='godot-pc/world-final/nature/';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const world=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const terrain=world.spaces.surface.terrain,collision=world.spaces.surface.collision;
const forest=read(nature+'authored-D13.json'),grass=read(nature+'groundcover-authored-D13.json');
const protectedPaths=['godot-pc/world-final/geology-D13/heightmap.f32',nature+'authored-D13.json',nature+'groundcover-authored-D13.json',nature+'collision-D13.json',nature+'groundcover-collision-D13.json','godot-pc/world-final/world_layout.json','src/data/p2-starter-population-v3.ts'];
const bounds={forest:[-300,154,-220,234],shore:[-64,-94,-6,-44]};
const inside=(x,z,b)=>x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3];
const routes=read('docs/world-expansion-v3/P2_QUEST_ROUTES.json').results.map(r=>({name:r.name,points:r.movementTrace.map(p=>({x:p.x,z:p.z}))}));
const slots=world.slots.filter(s=>s.canonicalMobId);
const treeCoords=[[-289,222],[-284,227],[-293,214],[-297,204],[-223,221],[-238,231],[-224,215],[-294,189],[-294,181],[-297,173],[-237,159],[-229,164],[-234,170],[-224,183],[-298,194],[-291,195],[-287,189],[-286,180],[-297,185],[-288,205],[-286,215],[-296,219],[-293,226],[-280,227]];
const ages=[['pine_tree_01_0',.85],['alder_understorey_1',.85],['pine_tree_01_2',.5],['pine_tree_01_1',.92],['pine_tree_01_0',.86],['alder_understorey_0',1.1],['pine_tree_01_1',.58],['pine_tree_01_2',.85],['alder_understorey_1',.9],['pine_tree_01_0',.78],['pine_tree_01_1',.91],['alder_understorey_0',.82],['pine_tree_01_2',.56],['pine_tree_01_0',.81],['alder_understorey_1',.75],['pine_tree_01_2',.4],['alder_understorey_0',.9],['pine_tree_01_1',.45],['pine_tree_01_0',.6],['alder_understorey_1',.65],['pine_tree_01_2',.32],['pine_tree_01_1',1.03],['alder_understorey_0',.85],['pine_tree_01_2',.55]];
const trees=treeCoords.map(([x,z],i)=>({id:'P2N_tree_'+String(i).padStart(3,'0'),asset:ages[i][0],position:[x,terrain.heightAt(x,-z),z],scale:ages[i][1],yaw:((i*2.399)%6.283)-3.1416}));
if(process.argv.includes('--validate')){
 const placement=read(out+'candidate-placements.json'),extra=new CollisionWorld();
 for(const c of placement.obstacles)c.kind==='box'?extra.addBox(c.x,c.z,c.halfX,c.halfZ,c.rotation,c.bottom,c.top):extra.addCircle(c.x,c.z,c.radius,c.bottom,c.top);
 const proposed={isBlocked:(p,r)=>collision.isBlocked(p,r)||extra.isBlocked(p,r)};
 const result={scope:'candidate only; source server collision, no runtime mutation',slots:world.slots.length,checks:[]};
 const check=(name,pass,evidence)=>result.checks.push({name,pass,evidence});
 const initial=read(out+'site-snapshot.json');
 check('population count unchanged',world.slots.length===initial.population.count&&world.slots.length===1151,{initial:initial.population.count,current:world.slots.length});
 for(const [p,hash] of Object.entries(initial.protectedHashes))check('unchanged '+p,sha(p)===hash,sha(p));
 for(const s of slots){
  const radius=s.bodyRadius??.46;check('slot '+s.uid,!proposed.isBlocked(s,radius),{x:s.x,z:s.z,radius});
 }
 for(const r of routes){
  let baselineBlocked=0,newBlocked=0;const affected=[];
  for(let i=1;i<r.points.length;i++){
   const a=r.points[i-1],b=r.points[i],old=pathSegmentIsClear(collision,a,b,.46),now=pathSegmentIsClear(proposed,a,b,.46);
   if(!old)baselineBlocked++;if(old&&!now){newBlocked++;affected.push(i);}
  }
  check('preserved route '+r.name,newBlocked===0,{segments:r.points.length-1,baselineBlocked,newBlocked,affected});
 }
 const trunks=placement.obstacles.filter(o=>o.id.startsWith('P2N_tree_'));
 const pairs=[];for(let i=0;i<trunks.length;i++)for(let j=i+1;j<trunks.length;j++){
  const a=trunks[i],b=trunks[j];pairs.push({a:a.id,b:b.id,gap:Math.hypot(a.x-b.x,a.z-b.z)-a.radius-b.radius});
 }
 pairs.sort((a,b)=>a.gap-b.gap);check('trunk-to-trunk passage',pairs[0].gap>=2.4,pairs.slice(0,5));
 const mid={x:-263,z:-204};check('central combat clearing',!proposed.isBlocked(mid,4.5),mid);
 const corridor=[{x:-263,z:-228},{x:-263,z:-180}];check('continuous 5m central passage',pathSegmentIsClear(proposed,...corridor,2.5),corridor);
 for(const shot of placement.shots){const p={x:shot.heroGodot[0],z:-shot.heroGodot[2]};check('hero camera site '+shot.name,!proposed.isBlocked(p,.46),p);}
 result.failed=result.checks.filter(c=>!c.pass).length;
 writeFileSync(out+'collision-check.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({checks:result.checks.length,failed:result.failed,closestTrunks:pairs[0]}));
 if(result.failed)process.exitCode=1;
}else{
 const regions=Object.fromEntries(Object.entries(bounds).map(([key,b])=>{
  const step=.5,columns=Math.round((b[2]-b[0])/step),rows=Math.round((b[3]-b[1])/step),heights=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++)heights.push(terrain.heightAt(b[0]+i*step,-(b[1]+j*step)));
  return [key,{bounds:b,step,columns,rows,heights,minHeight:Math.min(...heights),maxHeight:Math.max(...heights),
   basePlacements:forest.placements.filter(p=>inside(p.position[0],p.position[2],b)),
   baseGrass:grass.grass_cells.flatMap(c=>c.points).filter(p=>inside(p[0],p[2],b)),
   slots:slots.filter(s=>inside(s.x,-s.z,b))}];
 }));
 const contexts=Object.fromEntries(Object.entries(bounds).map(([name,core])=>{
  const b=[core[0]-48,core[1]-48,core[2]+48,core[3]+48],step=2,columns=(b[2]-b[0])/step,rows=(b[3]-b[1])/step,heights=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++)heights.push(terrain.heightAt(b[0]+i*step,-(b[1]+j*step)));
  return [name,{bounds:b,core,step,columns,rows,heights}];
 }));
 const source={schema:1,scope:'separate P2 nature candidate, not runtime',coordinates:'Godot [X,Y,Z]; Blender [X,-Z,Y]; server z=-GodotZ',contexts,
  population:{version:world.populationVersion,count:world.slots.length},protectedHashes:Object.fromEntries(protectedPaths.map(p=>[p,sha(p)])),
  regions,trees,water:world.layout.water,catalog:forest.catalog,grassCatalog:read(nature+'groundcover-library-D11B.json').catalog,routes};
 writeFileSync(out+'site-snapshot.json',JSON.stringify(source)+'\n');
 console.log(JSON.stringify({regions:Object.fromEntries(Object.entries(regions).map(([k,v])=>[k,{bounds:v.bounds,height:[v.minHeight,v.maxHeight],baseObjects:v.basePlacements.length,baseGrass:v.baseGrass.length,slots:v.slots.length}])),slots:world.slots.length,trees:trees.length}));
}
