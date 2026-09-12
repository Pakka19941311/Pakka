// Read-only: instantiate the actual supplied server module and its geometry.
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
const root=resolve(process.argv[2]);
const geometry=existsSync(join(root,'world-final'))?join(root,'world-final'):join(root,'godot-pc/world-final');
const settings=join(root,'world-runtime.json');
const populationMode=existsSync(settings)?JSON.parse(readFileSync(settings,'utf8')).populationMode:'starter-v3';
const {FinalWorld}=await import(pathToFileURL(join(root,'src/world/final-world.ts')).href);
const world=new FinalWorld(geometry,true,{populationMode});
const files=['world_layout.json','geology-D13/terrain.json','geology-D13/heightmap.f32',
 'geography/collision.json','geography/support-surfaces.json','nature/collision-D13.json',
 'nature/groundcover-collision-D13.json','castle/courtyard.json','interiors/spaces.json',
 'interiors/mine.json','interiors/great_cave.json','gameplay/spawn-manifest.json'];
if(populationMode==='starter-v3')files.push(world.courtyardPath,world.natureSamplePath);
for(const id of ['mine','great_cave'])files.push('interiors/'+JSON.parse(readFileSync(join(geometry,'interiors',id+'.json'),'utf8')).floor);
console.log(JSON.stringify({schema:1,mapVersion:world.mapVersion,populationMode,
 population:world.slots.length,geometryRoot:geometry,files:[...new Set(files)].sort(),
 obstacles:world.spaces.surface.collision.manifest().length,supports:world.spaces.surface.terrain.surfaces.length}));
