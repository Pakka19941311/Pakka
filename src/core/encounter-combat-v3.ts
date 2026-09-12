/** Pure V3 damage proposal. Not wired into the live simulation yet.
 * No player/monster level parameter: strength comes from authored stats and AI.
 */
export type EncounterDamageTypeV3='physical'|'magic';
export type EncounterElementV3='none'|'fire'|'ice'|'poison'|'shadow';
export type ResistancesV3=Partial<Record<EncounterElementV3,number>>;
export type EncounterDefenseV3={def:number;mdef:number;resistances?:ResistancesV3};
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
export function resolveMonsterDamageV3(raw:number,type:EncounterDamageTypeV3,defender:EncounterDefenseV3,
 element:EncounterElementV3='none',defenseReduction=0):number {
 if(!Number.isFinite(raw)||!Number.isFinite(defenseReduction))throw new RangeError('Finite damage and reduction required');
 if(raw<=0)return 0;
 const defense=type==='physical'?defender.def:defender.mdef;
 if(!Number.isFinite(defense))throw new RangeError('Finite defense required');
 const effective=Math.max(0,defense-Math.max(0,defenseReduction));
 const authoredResistance=defender.resistances?.[element]??0;
 if(!Number.isFinite(authoredResistance))throw new RangeError('Finite resistance required');
 const resistance=clamp(authoredResistance,-.25,.35);
 return Math.max(1,Math.round(raw*150/(150+effective)*(1-resistance)));
}
/** Matches existing physical hero reduction/guard rounding; magic selects MDEF. */
export function resolveHeroDamageV3(raw:number,type:EncounterDamageTypeV3,defender:EncounterDefenseV3,guard=false):number {
 if(!Number.isFinite(raw))throw new RangeError('Finite damage required');
 if(raw<=0)return 0;
 const defense=type==='physical'?defender.def:defender.mdef;
 if(!Number.isFinite(defense))throw new RangeError('Finite hero defense required');
 const base=Math.max(1,Math.round(raw-Math.max(0,defense)*.2));
 return guard?Math.max(1,Math.round(base*.5)):base;
}
/** 100 accuracy preserves current enemy hit chance. Lower authored ratings add
 * an explicit enemy miss chance; player accuracy continues using attack-accuracy.ts.
 */
export function enemyHitChanceV3(accuracy:number,heroEvasion:number):number {
 if(!Number.isFinite(accuracy)||!Number.isFinite(heroEvasion))throw new RangeError('Finite accuracy/evasion required');
 return clamp(accuracy,0,100)/100*(1-clamp(heroEvasion/100,0,.75));
}
