/** Explicit pre-integration evidence; never replaces an earlier baseline. */
import {existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FinalWorld} from '../../src/world/final-world.ts';
const path='art/p2-nature-sample-v3/integration-baseline.json';
if(existsSync(path))throw Error('Keep the recorded pre-integration baseline');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const worlds=Object.fromEntries(['legacy','starter-v3'].map(populationMode=>{
 const w=new FinalWorld(undefined,true,{populationMode});
 return [populationMode,{mapVersion:w.mapVersion,slots:w.slots.length,slotsHash:hash(w.slots),servicesHash:hash(w.services),layoutHash:hash(w.layout),
  terrainHashes:Object.fromEntries(Object.entries(w.spaces).map(([id,s])=>[id,createHash('sha256').update(new Uint8Array(s.terrain.heights.buffer)).digest('hex')])),
  safeSamples:[[-263,-204],[-100,-190],[-490,-356],[-40,72],[35,395]].map(([x,z])=>({x,z,safe:w.safe({x,z,spaceId:'surface'})}))}];
}));
writeFileSync(path,JSON.stringify({scope:'before P2 nature collision integration; same committed candidate 9c5d783',worlds},null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(worlds).map(([id,w])=>[id,{mapVersion:w.mapVersion,slots:w.slots}]))));
