import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {FinalWorld} from '../src/world/final-world.ts';
import {findNavigationPath} from '../src/world/navigation.ts';

const world=new FinalWorld(), collision=world.spaces.surface.collision;
const data=JSON.parse(readFileSync('godot-pc/world-final/castle/courtyard.json','utf8'));
const gate={x:-100,z:-238};
function walk(from,to,r=.46){
  assert.equal(collision.isBlocked(from,r),false,`blocked start ${JSON.stringify(from)}`);
  assert.equal(collision.isBlocked(to,r),false,`blocked destination ${JSON.stringify(to)}`);
  const path=findNavigationPath(collision,from,to,{actorRadius:r,cellSize:.85,margin:18,maxVisited:14000});
  assert.ok(path.length,`no route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  let p=from;
  for(const point of path){
    const d=Math.hypot(point.x-p.x,point.z-p.z),n=Math.max(1,Math.ceil(d/.2));
    const start=p;
    for(let i=1;i<=n;i++)assert.equal(collision.isBlocked({x:start.x+(point.x-start.x)*i/n,z:start.z+(point.z-start.z)*i/n},r),false,'path crosses a physical prop');
    p=point;
  }
  assert.ok(Math.hypot(p.x-to.x,p.z-to.z)<1,'path did not reach destination');
}

test('castle gate, main avenue and all six established services remain accessible',()=>{
  walk(gate,{x:-100,z:-95});
  const expected={shop:[-111,-190],elder:[-100,-180],smith:[-135,-188],teleport:[-86,-191],alchemist:[-125,-180],storage:[-75,-189]};
  for(const [id,[x,z]] of Object.entries(expected)){
    const p=world.services['npc:'+id];assert.deepEqual([p.x,p.z],[x,z],'service anchor was moved');
    walk(gate,p);
  }
});

test('every authored resident route is reachable without correcting its spawn',()=>{
  assert.equal(new Set(data.residents.map(r=>r.seed)).size,15);
  for(const resident of data.residents){
    assert.equal(collision.isBlocked(resident,.42),false,resident.name);
    for(let i=0;i<resident.route.length;i++)walk(resident.route[i],resident.route[(i+1)%resident.route.length],.42);
  }
});

test('rest, training, garden and supply areas connect to the gate',()=>{
  for(const p of [{x:-49,z:-146},{x:-118,z:-154},{x:-165,z:-190},{x:-71,z:-187},{x:-154,z:-168.8}])walk(gate,p);
  for(const animal of data.wildlife)assert.equal(collision.isBlocked(animal,.46),false,animal.species+' embedded in a prop');
});

test('courtyard props are local, solid, and canopy clearance stays open',()=>{
  for(const o of data.obstacles){
    assert.ok(o.x>=-175&&o.x<=-30&&o.z>=-218&&o.z<=-127,'decoration escaped castle');
    if(o.blocksMovement)assert.equal(collision.isBlocked({x:o.x,z:o.z},.05),true);
  }
  assert.equal(collision.isBlocked({x:-121,z:-197.7},.42),false,'merchant can stand under canopy');
  assert.equal(world.slots.length,1001,'ambient residents must not replace monster slots');
});
