// The native client draws monster centres to 85 m. Retain a 15 m preload
// margin, plus selected/engaged actors, without changing persistent population.
export const MONSTER_INTEREST_METRES = 100;
export function monsterInInterest(monster: {uid: string;x: number;z: number;spaceId?: string;targetId?: string|null},
  hero: {id: string;x: number;z: number;spaceId?: string;target?: string|null}): boolean {
  const space=hero.spaceId??'surface';
  if((monster.spaceId??'surface')!==space)return false;
  // Small, bounded interiors retain their complete population, including corpses
  // and the boss at the far end of the cave. Surface preload remains unchanged.
  if(space==='mine'||space==='great_cave')return true;
  if(monster.uid===hero.target || monster.targetId===hero.id)return true;
  const dx=monster.x-hero.x,dz=monster.z-hero.z;
  return dx*dx+dz*dz<MONSTER_INTEREST_METRES*MONSTER_INTEREST_METRES;
}
