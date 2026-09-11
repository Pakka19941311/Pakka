import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
import {findNavigationPath} from '../src/world/navigation.ts';
const w=new FinalWorld(),c=w.spaces.surface.collision;
const d=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard.json','utf8'));

test('the visible streets have unobstructed continuous centre lines',()=>{
 const problems=[];
 for(const street of d.quarter.streets)for(let k=1;k<street.points.length;k++){
  const a=street.points[k-1],b=street.points[k],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.20);
  for(let i=0;i<=steps;i++){
   const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};
   if(c.isBlocked(p,.46)){problems.push({street:street.name,point:p});break;}
  }
 }
 assert.deepEqual(problems,[],'a visible road runs through architecture or furniture');
});

test('both inns, every fair stall and quarter destinations connect to the gate',()=>{
 const points=[...d.quarter.routeReview,...d.quarter.markets.map(m=>m.approach),d.tavern.inside,d.quarter.alehouse.entry];
 for(const p of points){
  assert.equal(c.isBlocked(p,.46),false,JSON.stringify(p));
  assert.ok(findNavigationPath(c,{x:-100,z:-205},p,{actorRadius:.46,cellSize:.65,margin:24,maxVisited:18000}).length,'unreachable quarter destination '+JSON.stringify(p));
 }
});

test('new trade scenes have distinct stock, accessible vendors and solid houses',()=>{
 assert.equal(d.quarter.buildings.length,11);assert.equal(new Set(d.quarter.markets.map(m=>m.goods)).size,6);
 for(const house of d.quarter.buildings)assert.equal(c.isBlocked(house,.46),true,house.id+' lacks physical walls');
 for(const m of d.quarter.markets){
  const vendor=d.residents.find(r=>r.seed===m.vendor);assert.ok(vendor,m.id+' lacks vendor');
  assert.equal(c.isBlocked(vendor,.42),false,m.id+' vendor embedded in stock');
 }
});
