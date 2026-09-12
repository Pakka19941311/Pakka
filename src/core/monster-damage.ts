import {resolveMonsterDamageV3} from './encounter-combat-v3.ts';
import type {EncounterDamageTypeV3,EncounterElementV3,EncounterDefenseV3} from './encounter-combat-v3.ts';

/** Server-owned source metadata; visuals and owner scaling never select defense. */
export type MonsterDamageChannel={type:EncounterDamageTypeV3;element:EncounterElementV3};
export type MonsterDamagePacket=MonsterDamageChannel&{
  raw:number;source:'ordinary'|'book'|'dot'|'area'|'trap'|'summon';critical:boolean;bookId?:string;
};
export type MonsterDamageDefense=Partial<EncounterDefenseV3>;
/** The only monster mitigation formula. Legacy definitions explicitly have zero
 * missing defense; never borrow a staged V3 profile from a similar species. */
export function resolveTypedMonsterDamage(packet:MonsterDamagePacket,defender:MonsterDamageDefense,
  reductions:{defDown?:number;mdefDown?:number}={}):number{
  return resolveMonsterDamageV3(packet.raw,packet.type,{def:defender.def??0,mdef:defender.mdef??0,
    resistances:defender.resistances},packet.element,(packet.type==='physical'?reductions.defDown:reductions.mdefDown)??0);
}

export const PHYSICAL_DAMAGE:MonsterDamageChannel={type:'physical',element:'none'};
export const FIRE_DAMAGE:MonsterDamageChannel={type:'magic',element:'fire'};
export const SHADOW_DAMAGE:MonsterDamageChannel={type:'magic',element:'shadow'};
export const MAGIC_DAMAGE:MonsterDamageChannel={type:'magic',element:'none'};
export const POISON_DAMAGE:MonsterDamageChannel={type:'physical',element:'poison'};

/** Old records keep their timers/carry/owner. Unknown records are an explicit
 * compatibility error, never erased or silently granted unmitigated damage. */
export function savedBookDamageChannel(kind:'dot'|'area'|'trap',id:string,channel?:MonsterDamageChannel):MonsterDamageChannel{
  if(channel)return channel;
  if(kind==='trap')return PHYSICAL_DAMAGE; // Trap IDs are random UIDs, not book IDs.
  if(kind==='dot'){
    if(id==='poison')return POISON_DAMAGE;
    if(id==='fire')return FIRE_DAMAGE;
    if(id==='lightning')return MAGIC_DAMAGE;
  }else{
    if(id==='book_mage_50')return MAGIC_DAMAGE;
    if(id==='book_necro_50')return FIRE_DAMAGE;
  }
  throw new Error('unknown-saved-book-damage:'+kind+':'+id);
}
/** Legacy status.dot predates BookDot and retained only its owner, not skill FX.
 * Its former producers are ranger/assassin poison and necromancer curse. */
export function legacyStatusDotChannel(classId:string):MonsterDamageChannel{
  return classId==='assassin'||classId==='ranger'?POISON_DAMAGE:SHADOW_DAMAGE;
}
