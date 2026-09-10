// Derive the native client's presentation inputs from the existing reviewed TS code.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { CLASSES, ITEMS, MONSTERS, EQUIP_SLOTS, SLOT_NAMES, LOCATIONS } from '../src/data/game-data.ts';
import {SKILL_BOOKS,BOOK_TEST_DEFAULTS} from '../src/data/skill-books.ts';
import { CONTENT_VERSION, mapVersion } from '../src/server/content-manifest.ts';
import { restoreWorldTopology } from '../src/world/world-topology.ts';
import { buildTerritory } from '../src/world/territory-layout.ts';
import { quickDefaults, QUICK_KEYS } from '../src/controls/quickbar.ts';
import { itemStatBreakdown } from '../src/core/equipment-stats.ts';
import { SCROLLS, ENHANCEMENT_PERCENT } from '../src/core/enhancement-v2.ts';
import { xpNeeded, MAX_LEVEL } from '../src/core/game-rules.ts';

const root=process.cwd(),output=resolve(root,'godot-pc/generated');mkdirSync(output,{recursive:true});
const authored=buildTerritory(), {terrain,placements}=authored;
/* Legacy browser authoring remains in src/main.ts. Native P1 territory now has
 * one declarative source shared with the server, migration and in-game atlas. */

const geometry=terrain.geometry();
const topology=JSON.parse(readFileSync('public/assets/world/world-topology.json','utf8'));
if(JSON.stringify(topology)!==JSON.stringify(authored.topology))throw Error('Committed topology differs from authored territory; run scripts/build-territory.mjs');
const restoredTopology=restoreWorldTopology(topology);
const itemStats=Object.fromEntries(Object.entries(ITEMS).map(([id,def])=>[id,Array.from({length:16},(_,plus)=>itemStatBreakdown(def,plus))]));
const itemLayout=JSON.parse(readFileSync('art/item-icons-v3/layout.json','utf8'));
const itemIcons=Object.fromEntries(itemLayout.sheets.flatMap(sheet=>sheet.items.map(item=>[item.id,{file:sheet.file,column:item.column,row:item.row}])));
const monsterLock=JSON.parse(readFileSync('art/monsters-v3/source-lock.json','utf8'));
const monsterProfiles=Object.fromEntries(monsterLock.models.filter(m=>existsSync(`art/monsters-v3/runtime/${m.name}.json`)).map(m=>[m.name,JSON.parse(readFileSync(`art/monsters-v3/runtime/${m.name}.json`,'utf8'))]));
writeFileSync(resolve(output,'game.json'),JSON.stringify({contentVersion:CONTENT_VERSION,mapVersion:mapVersion(restoredTopology.collision,restoredTopology.terrain),classes:CLASSES,books:SKILL_BOOKS,bookTestDefaults:BOOK_TEST_DEFAULTS,items:ITEMS,itemIcons,monsters:MONSTERS,equipSlots:EQUIP_SLOTS,slotNames:SLOT_NAMES,locations:LOCATIONS,quickDefaults:quickDefaults(),quickKeys:QUICK_KEYS,itemStats,scrolls:SCROLLS,chances:ENHANCEMENT_PERCENT,xpNeeded:Array.from({length:MAX_LEVEL+1},(_,i)=>xpNeeded(Math.max(1,i)))}));
writeFileSync(resolve(output,'terrain.json'),JSON.stringify({width:terrain.width,depth:terrain.depth,columns:terrain.columns,rows:terrain.rows,heights:Array.from(terrain.heights),roads:terrain.roads,platforms:topology.platforms,colliders:topology.colliders}));
writeFileSync(resolve(output,'territory.json'),JSON.stringify(authored.territory));
writeFileSync(resolve(output,'layout.json'),JSON.stringify({placements,geometry,territory:authored.territory}));
const itemIconDir=resolve(output,'item-icons');mkdirSync(itemIconDir,{recursive:true});for(const sheet of itemLayout.sheets)cpSync(`art/item-icons-v3/${sheet.file}`,resolve(itemIconDir,sheet.file));
const iconDir=resolve(output,'book-icons');mkdirSync(iconDir,{recursive:true});for(const name of ['knight','mage','ranger','necro','assassin','haste'])cpSync(`art/skill-books-v1/${name}.png`,resolve(iconDir,name+'.png'));
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

cpSync(resolve(root, "public/assets/audio/sfx"), resolve(output, "audio"), {recursive:true});

cpSync(resolve(root, "public/assets/audio/ambient/forest.mp3"), resolve(output, "audio/forest.mp3"));

// Approved visual replacement preserves the old server animation cadence.
if(existsSync('art/monsters-v3/forest/ForestLord.glb'))cpSync('art/monsters-v3/forest/ForestLord.glb',resolve(output,'actors/ForestLord.glb'));
for(const model of monsterLock.models)if(existsSync(`art/monsters-v3/runtime/${model.name}.glb`))cpSync(`art/monsters-v3/runtime/${model.name}.glb`,resolve(output,'actors',model.name+'.glb'));
writeFileSync(resolve(output,'monster-profiles.json'),JSON.stringify(monsterProfiles));
