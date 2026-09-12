// The native client draws monster centres to 85 m. Retain a 15 m preload
// margin, plus selected/engaged actors, without changing persistent population.
export const MONSTER_INTEREST_METRES = 100;
export function monsterInInterest(monster: {uid: string;x: number;z: number;targetId?: string|null},
  hero: {id: string;x: number;z: number;target?: string|null}): boolean {
  if(monster.uid===hero.target || monster.targetId===hero.id)return true;
  const dx=monster.x-hero.x,dz=monster.z-hero.z;
  return dx*dx+dz*dz<MONSTER_INTEREST_METRES*MONSTER_INTEREST_METRES;
}
