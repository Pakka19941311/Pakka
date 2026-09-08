import {writeFileSync} from 'node:fs';
import {buildTerritory} from '../src/world/territory-layout.ts';
const world=buildTerritory();
writeFileSync('public/assets/world/world-topology.json',JSON.stringify(world.topology)+'\n');
console.log(JSON.stringify({version:world.territory.version,placements:world.placements.length,trees:world.territory.trees.length,colliders:world.topology.colliders.length,roads:world.terrain.roads.length}));
