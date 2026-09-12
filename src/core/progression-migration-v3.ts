import {MAX_LEVEL,xpNeeded} from './game-rules.ts';

export type LegacyProgression = {version:3;originalLevel:number;originalXp:number;reason:'level-cap-90'};
/** Preserve the old progression record, then apply the new cap without giving XP, items or healing. */
export function normalizeProgressionV3<T extends {level:number;xp:number;legacyProgression?:LegacyProgression}>(character:T):T {
  if(!Number.isSafeInteger(character.level)||character.level<1||!Number.isSafeInteger(character.xp)||character.xp<0)
    throw Error('invalid-saved-progression');
  if(character.level<MAX_LEVEL||character.level===MAX_LEVEL&&character.xp<xpNeeded(MAX_LEVEL))return character;
  const next={...character,level:MAX_LEVEL,xp:Math.min(character.xp,xpNeeded(MAX_LEVEL)-1)};
  next.legacyProgression??={version:3,originalLevel:character.level,originalXp:character.xp,reason:'level-cap-90'};
  return next;
}
