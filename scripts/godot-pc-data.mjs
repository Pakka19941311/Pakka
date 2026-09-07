// Derive the native client's presentation inputs from the existing reviewed TS code.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { CLASSES, ITEMS, MONSTERS, EQUIP_SLOTS, SLOT_NAMES, LOCATIONS } from '../src/data/game-data.ts';
import { CONTENT_VERSION, mapVersion } from '../src/server/content-manifest.ts';
import { restoreWorldTopology } from '../src/world/world-topology.ts';
import { TerrainSurface } from '../src/world/terrain-surface.ts';
import { greenfallFortLayout } from '../src/world/greenfall-layout.ts';
import { createLayoutRandom } from '../src/world/layout-random.ts';
import { quickDefaults, QUICK_KEYS } from '../src/controls/quickbar.ts';
import { itemStatBreakdown } from '../src/core/equipment-stats.ts';
import { SCROLLS, ENHANCEMENT_PERCENT } from '../src/core/enhancement-v2.ts';
import { xpNeeded, MAX_LEVEL } from '../src/core/game-rules.ts';

const root=process.cwd(),output=resolve(root,'godot-pc/generated');mkdirSync(output,{recursive:true});
const terrain=new TerrainSurface(), placements=[];
function placed(record){
  placements.push(record);
  return {position:{set(x,y,z){Object.assign(record,{x,y,z});}},rotation:{},scaling:{},getDescendants:()=>[]};
}
function asset(name,x,z,height,rotation=0,extra={}){return placed({kind:'asset',name,x,z,y:terrain.heightAt(x,z),height,rotation,...extra});}
const context={terrain,greenfallFortLayout,createLayoutRandom,Math,layoutRandom:createLayoutRandom(),
 collisionWorld:{clear(){},addCircle(){},addBox(){}},sectorNodes:new Map(),shadowCasters:new Set(),scene:{onBeforeRenderObservable:{add(){}}},
 engine:{getDeltaTime:()=>16},assignWorldSector(){},finishTerrain(){},
 roofSlateMaterial:{},Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}},
 Color3:class{},PBRMaterial:class{},PointLight:class{},TransformNode:class{},
 road(x,z,width,depth,rotation=0){terrain.addRoad(x,z,width,depth,rotation);},
 createPineTree(name,x,z,height,rotation){return asset(`pine_tree_01/${Number(name.split('-').at(-1))%3}`,x,z,height,rotation);},
 approvedEnvironmentModel(name,variant,x,z,height,rotation=0){return asset(`${name}/${variant}`,x,z,height,rotation);},
 realismModel(name,x,z,height,rotation=0){
  if(['boulder_01','rock_09'].includes(name))return asset(`rock_moss_set_01/${Math.abs(Math.round(x*7+z*3))%6}`,x,z,height,rotation);
  return asset('realism/'+name,x,z,height,rotation);
 },
 castleModel(name,x,z,height,rotation=0,footprint={}){return asset('castle/'+name,x,z,height,rotation,footprint);},
 realismModelPart(part,x,z,height,rotation,footprint){return asset('castle/'+({wall_thin_gate_01:'castle_arch',wall_thin_straight_01:'castle_wall',tower_round:'castle_tower'})[part],x,z,height,rotation,footprint);},
 worldModel(name,x,z,scale=1,rotation=0,tint){return asset('world/'+name,x,z,null,rotation,{scale,tint});},
 townBox(name,x,y,z,width,height,depth,color){return placed({kind:'box',name,x,y,z,width,height,depth,color});},
 townCylinder(name,x,y,z,diameter,height,color){return placed({kind:'cylinder',name,x,y,z,diameter,height,color});},
 createGabledRoof(_scene,name,width,depth,height){return placed({kind:'roof',name,width,depth,height});},
 createLivingFire(_scene,name,opts){placed({kind:'fire',name,...opts});return {flames:[],embers:[]};}
};
const source=readFileSync('src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const names=new Set(['roadBetween','createBuilding','createWatchTower','createGate','createSmithy','buildTown','createBonfire','buildStarterSettlement','buildRuinLandmark','buildFrontierCamp','buildWorld']);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast));
if(functions.length!==names.size)throw Error('Reviewed world construction functions changed');
vm.runInNewContext(ts.transpileModule(functions.join('\n')+'\nbuildWorld();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context,{timeout:30000});
const geometry=terrain.geometry();
const topology=JSON.parse(readFileSync('public/assets/world/world-topology.json','utf8'));
const restoredTopology=restoreWorldTopology(topology);
const itemStats=Object.fromEntries(Object.entries(ITEMS).map(([id,def])=>[id,Array.from({length:16},(_,plus)=>itemStatBreakdown(def,plus))]));
writeFileSync(resolve(output,'game.json'),JSON.stringify({contentVersion:CONTENT_VERSION,mapVersion:mapVersion(restoredTopology.collision,restoredTopology.terrain),classes:CLASSES,items:ITEMS,monsters:MONSTERS,equipSlots:EQUIP_SLOTS,slotNames:SLOT_NAMES,locations:LOCATIONS,quickDefaults:quickDefaults(),quickKeys:QUICK_KEYS,itemStats,scrolls:SCROLLS,chances:ENHANCEMENT_PERCENT,xpNeeded:Array.from({length:MAX_LEVEL+1},(_,i)=>xpNeeded(Math.max(1,i)))}));
writeFileSync(resolve(output,'terrain.json'),JSON.stringify({width:terrain.width,depth:terrain.depth,columns:terrain.columns,rows:terrain.rows,heights:Array.from(terrain.heights),platforms:topology.platforms,colliders:topology.colliders}));
writeFileSync(resolve(output,'layout.json'),JSON.stringify({placements,geometry}));
for(const name of ['Warrior','Wizard','Ranger','Rogue','Monk']){const p=resolve(output,'actors',name+'.gltf');mkdirSync(dirname(p),{recursive:true});cpSync(`public/assets/models/characters/${name}.gltf`,p);}
for(const name of ['Fox','Skeleton','Slime','Dragon','Bat'])cpSync(`public/assets/models/monsters-glb/${name}.glb`,resolve(output,'actors',name+'.glb'));
console.log(JSON.stringify({placements:placements.length,terrainTriangles:(geometry.groundIndices.length+geometry.roadIndices.length)/3,characters:Object.keys(CLASSES).length,itemDefinitions:Object.keys(ITEMS).length,quickSlots:quickDefaults().length}));

// Cross-engine collision contract: actual map vectors, including rounded box
// corners, overhead arches, long sweeps and embedded starts.
const shared=restoreWorldTopology(topology).collision;
const collisionCases=topology.colliders.filter((_,i)=>i%3===0).flatMap((c,i)=>[
  {x:c.x+(c.halfX??c.radius)+.4,z:c.z+(c.halfZ??0)+.4,dx:-.28,dz:-.31},
  {x:c.x,z:c.z,dx:Math.sin(i)*1.4,dz:Math.cos(i)*1.4},
]).map(v=>({...v,expected:shared.resolve({x:v.x,z:v.z},{x:v.dx,z:v.dz},.46)}));
writeFileSync(resolve(output,'collision-qa.json'),JSON.stringify(collisionCases));
