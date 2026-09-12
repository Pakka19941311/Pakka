import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
const old=new FinalWorld(),world=new FinalWorld(undefined,true,{populationMode:'starter-v3'});
const layout=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard-p2.json','utf8'));
const legacy=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard.json','utf8'));
const collision=world.spaces.surface.collision,terrain=world.spaces.surface.terrain;

test('one house replacement retains services, residents, tavern and legacy population',()=>{
 assert.deepEqual(world.services,old.services);
 for(const key of ['residents','wildlife','tavern','signs'])assert.deepEqual(layout[key],legacy[key]);
 assert.ok(!layout.props.some(p=>p.id==='Gate_exchange_house'));
 assert.equal(layout.props.filter(p=>p.id==='P2_Gate_exchange_house').length,1);
 assert.equal(world.slots.length,1151);assert.equal(old.slots.length,1001);
});
test('street and central ground passage remain traversable at hero and enlarged radius',()=>{
 for(const radius of [.46,.54]){
  // The frontage ends before the existing Podkova building; the street turns
  // north there rather than passing through the neighbouring tavern.
  for(let x=-96;x<=-70;x+=.2)assert.equal(collision.isBlocked({x,z:-205},radius),false,'front-street '+x);
  for(let z=-207;z>=-216;z-=.1)assert.equal(collision.isBlocked({x:-79,z},radius),false,'underpass '+z);
 }
 assert.equal(collision.isBlocked({x:-75,z:-211},.46),true,'closed left house');
 assert.equal(collision.isBlocked({x:-83,z:-211},.46),true,'closed right house');
});
test('exterior stair supports ascend and descend from real ground without a hidden wall',()=>{
 const x=-85.99;let previous=terrain.supportAt(x,-208.35),maxRise=0,high=previous;
 for(let z=-208.4;z>=-212.5;z-=.05){
  const p={x,z};assert.equal(collision.isBlocked(p,.46),false,'stair '+z);
  const y=terrain.supportAt(x,z);maxRise=Math.max(maxRise,Math.abs(y-previous));high=Math.max(high,y);previous=y;
 }
 assert.ok(maxRise<.27,'no tall threshold '+maxRise);assert.ok(high>72.5);
 let p={x,z:-208.4};
 for(let n=0;n<82;n++)p=collision.resolve(p,{x:0,z:-.05},.46);
 assert.ok(p.z<-212.4,'actual uphill movement '+p.z);
 for(let n=0;n<82;n++)p=collision.resolve(p,{x:0,z:.05},.46);
 assert.ok(p.z>-208.5,'actual downhill movement '+p.z);
});
