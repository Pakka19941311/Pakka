import assert from 'node:assert/strict';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';
import {STARTER_ITEMS} from '../../src/data/starter-progression-v3.ts';
import {p2Encounter} from '../../src/data/p2-encounters.ts';

export const PURSUIT_MOBS=['MOB-01','MOB-03','MOB-04','MOB-05'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const radial=(home,r,angle)=>({x:home.x+Math.cos(angle)*r,z:home.z+Math.sin(angle)*r,spaceId:'surface'});

/** Select only an existing persistent slot. No spawn, monster reset or simulation step. */
export function selectNativePursuitArena(world,geography,mobId){
 assert.ok(PURSUIT_MOBS.includes(mobId),'unsupported-native-pursuit-mob');
 assert.equal(geography.populationMode,'starter-v3');
 const collision=geography.spaces.surface.collision;
 const aggressive=world.state.monsters.filter(m=>m.alive&&(geography.slotById.get(m.uid)?.aggroRadius??0)>0);
 const candidates=world.state.monsters.filter(m=>m.alive&&m.canonicalMobId===mobId&&m.level>=2&&!m.targetId&&!m.provokedBy)
  .sort((a,b)=>a.level-b.level||a.uid.localeCompare(b.uid));
 for(const target of candidates){
  const slot=geography.slotById.get(target.uid),home=target.home,radius=Math.min(4.5,slot.leashRadius*.45);
  if(distance(target,home)>radius-1.5)continue;
  const clear=p=>!geography.safe(p)&&!collision.isBlocked(p,.54)&&!aggressive.some(m=>m.uid!==target.uid&&distance(m,p)<(geography.slotById.get(m.uid)?.aggroRadius??0)+1);
  // The whole disk is checked, including the pursuer's shorter chords. The
  // hero arc therefore cannot quietly route around an untested tree or wall.
  const points=[{...home,spaceId:'surface'}];
  for(let r=1;r<=radius+.6;r+=1)for(let i=0;i<48;i++)points.push(radial(home,r,i*Math.PI/24));
  if(points.some(p=>!clear(p)))continue;
  const escapeRoutes=[];
  for(let i=0;i<48;i++){
   const angle=i*Math.PI/24,standing=radial(home,3,angle),escape=radial(home,slot.leashRadius+9,angle);
   if(!clear(standing)||!world.lineOfSight(standing,target)||!pathSegmentIsClear(collision,standing,escape,.54))continue;
   if(Array.from({length:61},(_,j)=>radial(home,(slot.leashRadius+9)*j/60,angle)).some(p=>!clear(p)))continue;
   escapeRoutes.push({angle,standing,escape});
  }
  if(escapeRoutes.length){
   const {angle,standing,escape}=escapeRoutes[0];
   return {target:target.uid,mobId,home:{...home},standing,escape,angle,escapeRoutes,radius,leashRadius:slot.leashRadius,
    minimumContinuousMetres:12,level:target.level,maxHp:p2Encounter(target).hp,monsterHpBefore:target.hp,
    movementSpeed:p2Encounter(target).movementSpeed,population:world.state.monsters.length,
    method:'Existing slot; hero follows a clear arc inside unchanged leash, then leaves along a checked radial corridor. No monster mutation.'};
  }
 }
 throw Error('no-open-native-pursuit-arena:'+mobId);
}

/** One initial hero-only fixture, on the disposable test server. There are no
 * subsequent writes to HP, position, target, AI, clocks or skeletal phases. */
export function prepareNativePursuitFixture(world,geography,hero,mobId){
 const fixture=selectNativePursuitArena(world,geography,mobId);
 Object.assign(hero,{level:fixture.level,xp:0,inventory:[],lootBuffer:[],buffs:{},equipment:Object.fromEntries(
  ['starter_weapon_'+hero.classId,'starter_chest_'+hero.classId,'starter_head','starter_gloves','starter_boots','starter_belt']
   .map(id=>[STARTER_ITEMS[id].slot,world.item(id)]))});
 world.recalculate(hero);hero.hp=hero.maxHp;hero.mp=hero.maxMp;
 world.relocate(hero,{...fixture.standing});
 return {...fixture,kills:hero.kills,gold:hero.gold,heroId:hero.id};
}
