import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {referenceHero} from './balance.mjs';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {MONSTERS} from '../../src/data/game-data.ts';

const prepared=new WeakMap();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};

/** Disposable native QA only: one initial hero setup per stage. Existing full-HP
 * monsters and the running world clock are never relocated, healed or paused. */
export function prepareNativeLineFixture(world,geography,hero,stage){
 assert.equal(geography.populationMode,'starter-v3');
 assert.ok(['p2-line-fire','p2-line-ice-dodge'].includes(stage),'unknown-line-stage');
 const key=hero.id+':'+stage,receipts=prepared.get(world)??new Map();
 if(receipts.has(key))return structuredClone(receipts.get(key));
 const speciesId=stage==='p2-line-fire'?'fire_golem':'ice_golem';
 let target,standing,engagePoint,sidestep;
 for(const m of world.state.monsters.filter(m=>m.id===speciesId&&!m.canonicalMobId&&m.alive&&!m.targetId&&!m.returnFromTaunt&&m.hp===MONSTERS[m.id].hp&&
  (m.nextCounterAt??0)<=world.state.time&&!world.state.pending.some(a=>a.actor===m.uid))){
  for(let index=0;index<32;index++){
   const angle=index*Math.PI/16,q={spaceId:m.spaceId,x:m.x+Math.cos(angle)*11,z:m.z+Math.sin(angle)*11};
   const side={spaceId:q.spaceId,x:q.x-Math.sin(angle)*3.5,z:q.z+Math.cos(angle)*3.5};
   const collision=geography.space(q).collision;
   if(geography.safe(q)||collision.isBlocked(q,.46)||!world.lineOfSight(q,m)||!pathSegmentIsClear(collision,q,side,.46)||collision.isBlocked(side,.46))continue;
   // Find the real outer edge of a group instead of disabling its neighbours.
   const others=world.state.monsters.filter(other=>other!==m&&other.alive&&other.spaceId===q.spaceId);
   const otherClear=(a,b)=>others.every(other=>segmentDistance(other,a,b)>=Math.max(17,(geography.slotById.get(other.uid)?.aggroRadius??9)+5));
   if(!otherClear(q,side))continue;
   const stagingOptions=[{spaceId:q.spaceId,x:m.x+Math.cos(angle)*18,z:m.z+Math.sin(angle)*18},
    ...[16,-16,20,-20].map(offset=>({spaceId:q.spaceId,x:q.x-Math.sin(angle)*offset,z:q.z+Math.cos(angle)*offset}))];
   const staging=stagingOptions.find(point=>!geography.safe(point)&&!collision.isBlocked(point,.46)&&pathSegmentIsClear(collision,point,q,.46)&&otherClear(point,q));
   if(!staging)continue;
   target=m;standing=staging;engagePoint=q;sidestep=side;break;
  }if(target)break;
 }
 assert.ok(target,'no-valid-real-counter-target');
 const populationBefore=hash(world.state.monsters),clockBefore=world.state.time;
 const reference=referenceHero('ranger',15,3,'live');
 Object.assign(hero,{classId:'ranger',level:15,xp:0,equipment:Object.fromEntries(Object.entries(reference.equipment).map(([slot,item])=>[slot,{...world.item(item.id),plus:item.plus}]))});
 world.recalculate(hero);hero.dead=false;hero.hp=hero.maxHp;hero.mp=hero.maxMp;
 world.relocate(hero,standing);hero.yaw=Math.atan2(target.x-standing.x,target.z-standing.z);
 assert.equal(hash(world.state.monsters),populationBefore,'line-fixture-mutated-monsters');
 assert.equal(world.state.time,clockBefore,'line-fixture-mutated-clock');
 const result={stage,generation:hero.generation,targetUid:target.uid,speciesId,standing,engagePoint,sidestep,targetHp:target.hp,
  population:world.state.monsters.length,populationBefore,populationAfter:populationBefore,clockBefore,
  yaw:Math.atan2(standing.x-target.x,target.z-standing.z),pitch:.62,distance:15,
  method:'Initial ranger15 reference+3 only; real terrain, original monsters/HP/clock; one single attack and normal destination inputs.'};
 receipts.set(key,result);prepared.set(world,receipts);return structuredClone(result);
}
