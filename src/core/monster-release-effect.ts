/** Cosmetic release channel only; does not select damage type or timing. */
export function monsterReleaseEffect(speciesId:string):'fire'|'ice'|'slash'{
  if(speciesId==='fire_golem'||speciesId==='rift_boss'||speciesId==='cave_boss')return 'fire';
  if(speciesId==='ice_golem')return 'ice';
  return 'slash';
}
