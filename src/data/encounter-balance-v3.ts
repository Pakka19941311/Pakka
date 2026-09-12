import {mobV3,MINI_BOSSES_V3} from './world-expansion-v3.ts';
import {STARTER_ITEMS} from './starter-progression-v3.ts';
import type {ItemStatDefinition} from '../core/item-progression.ts';
import type {EncounterDamageTypeV3,EncounterElementV3,ResistancesV3} from '../core/encounter-combat-v3.ts';
export const ENCOUNTER_BALANCE_V3={revision:'encounter-balance-v3-candidate-1',runtimeEnabled:false,
 gates:['live-defense-single-application','caster-physical-weapon-stats','late-reference-gear-implementation','enemy-range-and-counter-AI','shared-consumable-server-cooldown','native-five-class-combat']} as const;
export type ReferenceItemV3=ItemStatDefinition&{name:string;requiredLevel:number;value:number;status:'fixture-not-live'};
export type BalanceTierV3='start'|'field'|'deep'|'high'|'end';
export const BALANCE_BANDS_V3=[
 {id:'start',min:1,max:9,equipment:.03,consumable:.08,normalScroll:.01,improvedScroll:0},
 {id:'field',min:10,max:29,equipment:.04,consumable:.09,normalScroll:.015,improvedScroll:.001},
 {id:'deep',min:30,max:49,equipment:.05,consumable:.10,normalScroll:.02,improvedScroll:.002},
 {id:'high',min:50,max:69,equipment:.06,consumable:.11,normalScroll:.025,improvedScroll:.0035},
 {id:'end',min:70,max:90,equipment:.07,consumable:.12,normalScroll:.03,improvedScroll:.005},
] as const;
export const POTIONS_BALANCE_V3=[
 {id:'potion',level:1,heal:37,price:55,status:'live'},
 {id:'potion_large',level:1,heal:70,price:110,status:'live'},
 {id:'v3_potion_concentrate',level:25,heal:220,price:330,status:'fixture-not-live'},
 {id:'v3_potion_elixir',level:50,heal:600,price:900,status:'fixture-not-live'},
 {id:'v3_potion_supreme',level:75,heal:1400,price:2100,status:'fixture-not-live'},
] as const;
/** The quest/shop catalogue owns the values; this view only marks its role in
 * analysis. Physical caster proposals remain separate until explicitly applied. */
export const STARTER_ITEMS_V3:Record<string,ReferenceItemV3>=Object.fromEntries(
 Object.entries(STARTER_ITEMS).map(([id,item])=>[id,{...item,status:'fixture-not-live' as const}]));
/** Separate, explicit proposals. Neither INT substitution nor mutation of ITEMS. */
export const CASTER_PHYSICAL_WEAPON_PROPOSALS_V3:Record<string,readonly[number,number]>={
 starter_weapon_mage:[4,8],starter_weapon_necro:[9,13],
 ember_staff:[7,11],rotten_root:[9,13],rift_staff:[11,15],warden_staff:[13,17],
 mourn_grimoire:[11,18],rift_grimoire:[17,24],warden_grimoire:[20,27],
};
export const REFERENCE_GEAR_STEPS_V3=[
 {level:30,tier:'deep',weapon:{knight:[22,30],assassin:[20,28],ranger:[22,29],necro:[22,29],mage:[10,14]},matk:42,
  chest:{knight:[26,10],assassin:[23,8],ranger:[22,8],mage:[8,35],necro:[13,32]},head:12,limb:5,belt:8},
 {level:50,tier:'high',weapon:{knight:[34,44],assassin:[29,40],ranger:[31,42],necro:[30,40],mage:[13,18]},matk:62,
  chest:{knight:[38,16],assassin:[31,12],ranger:[30,12],mage:[14,46],necro:[19,43]},head:17,limb:7,belt:11},
 {level:70,tier:'end',weapon:{knight:[48,60],assassin:[41,54],ranger:[43,56],necro:[42,55],mage:[17,23]},matk:84,
  chest:{knight:[52,22],assassin:[42,16],ranger:[40,16],mage:[20,60],necro:[27,56]},head:24,limb:10,belt:15},
] as const;
export const REFERENCE_GEAR_FIXTURES_V3:Record<string,ReferenceItemV3>={};
for(const step of REFERENCE_GEAR_STEPS_V3){
 for(const classId of ['knight','mage','assassin','ranger','necro'] as const){
  const [def,mdef]=step.chest[classId];
  REFERENCE_GEAR_FIXTURES_V3[`v3_ref_${step.tier}_weapon_${classId}`]={name:`Контрольное оружие ${step.tier} / ${classId}`,
   slot:'weapon',requiredLevel:step.level,atk:step.weapon[classId],matk:['mage','necro'].includes(classId)?step.matk+(classId==='necro'?2:0):undefined,
   accuracy:classId==='ranger'?7:2,crit:classId==='assassin'?5:undefined,classes:[classId],value:step.level*70,status:'fixture-not-live'};
  REFERENCE_GEAR_FIXTURES_V3[`v3_ref_${step.tier}_chest_${classId}`]={name:`Контрольная броня ${step.tier} / ${classId}`,
   slot:'chest',requiredLevel:step.level,def,mdef,classes:[classId],evasion:classId==='assassin'?5:undefined,value:step.level*50,status:'fixture-not-live'};
 }
 for(const [slot,def] of [['head',step.head],['gloves',step.limb],['boots',step.limb],['belt',step.belt]] as const){
  REFERENCE_GEAR_FIXTURES_V3[`v3_ref_${step.tier}_${slot}`]={name:`Контрольный ${slot} ${step.tier}`,
   slot,requiredLevel:step.level,def,mdef:Math.floor(def/3),value:step.level*20,assassinForeign:false,status:'fixture-not-live'};
 }
}
export const LOOT_PROFILES_V3=[
 {id:'P01',mobs:[1,5],families:['mage','necro','assassin'],material:'venom'},
 {id:'P02',mobs:[2,3,4,8,16,33],families:['knight','ranger','assassin'],material:'wolf_fang'},
 {id:'P03',mobs:[6,12,14,18,23,24,27],families:['necro','assassin','mage'],material:'venom'},
 {id:'P04',mobs:[10,11,19,31],families:['ranger','assassin','knight'],material:'iron'},
 {id:'P05',mobs:[7,13,17,21,29,32,34],families:['knight','ranger','assassin'],material:'iron'},
 {id:'P06',mobs:[9,15,26,30,46],families:['mage','necro','ranger'],material:'black_bone'},
 {id:'P07',mobs:[20,22,44,45,48],families:['knight','necro','ranger'],material:'black_bone'},
 {id:'P08',mobs:[25,28,37,43,47],families:['necro','mage','ranger'],material:'ancient_shard'},
 {id:'P09',mobs:[35,36],families:['ranger','necro','mage'],material:'ice_core'},
 {id:'P10',mobs:[38,39,40,41,42],families:['knight','mage','assassin'],material:'fire_core'},
] as const;
export type EncounterStyleV3='contact'|'predator'|'ranged'|'caster'|'heavy'|'golem';
export const STYLE_STATS_V3={
 contact:{hp:1,atk:1,def:1,mdef:1,interval:2.3,range:2.1,speed:3.4,accuracy:100},
 predator:{hp:.9,atk:.85,def:.85,mdef:.85,interval:1.9,range:2.4,speed:4.7,accuracy:97},
 ranged:{hp:.8,atk:.9,def:.7,mdef:1,interval:2.6,range:12,speed:3.7,accuracy:96},
 caster:{hp:.75,atk:1.1,def:.6,mdef:1.3,interval:3.0,range:11.5,speed:3.2,accuracy:96},
 heavy:{hp:1.5,atk:1.15,def:1.3,mdef:1,interval:3.1,range:3.0,speed:3.1,accuracy:94},
 golem:{hp:1.7,atk:1.25,def:1.5,mdef:1.5,interval:3.5,range:3.2,speed:3.0,accuracy:95},
} as const;
export const HP_KNOTS_V3=[[1,180],[9,205],[10,270],[29,315],[30,395],[49,460],[50,500],[69,570],[70,650],[90,700]] as const;
export function baselineHpV3(level:number):number{
 if(!Number.isInteger(level)||level<1||level>90)throw new RangeError('Authored level 1..90 required');
 const index=HP_KNOTS_V3.findIndex(p=>p[0]>=level);if(index===0)return HP_KNOTS_V3[0][1];
 const a=HP_KNOTS_V3[index-1],b=HP_KNOTS_V3[index];return Math.round(a[1]+(b[1]-a[1])*(level-a[0])/(b[0]-a[0]));
}
export function baseEncounterStatsV3(level:number){
 const a=level-1;return {hp:baselineHpV3(level),atk:Math.round(7+.82*a+.010*a*a),
 def:Math.round(.45*a+.003*a*a),mdef:Math.round(.45*a+.003*a*a)};
}
export function baseGoldV3(level:number):number{return Math.round(10+1.4*level+.6*level*level);}

/** P2 ecology proposal, pending real models and perception/LOS integration.
 * A population-group label never suppresses an independently provoked enemy.
 */
export const FIRST_HUNTING_BEHAVIORS_V3=[
 {mobId:'MOB-01',stance:'passive-defender',proximityAggro:0,provocation:'direct-hostile-damage',socialAggro:false,
  placementGroupMax:1,attackRange:2.1,telegraph:.55,leash:12,notes:'В покое не нападает; отвечает на нанесённый урон.'},
 {mobId:'MOB-02',stance:'territorial-pair',proximityAggro:8,provocation:'perception-with-LOS-or-damage',socialAggro:false,
  placementGroupMax:2,attackRange:2.4,telegraph:.65,leash:15,notes:'Два самостоятельных восприятия внутри пары; соседние пары разнесены.'},
 {mobId:'MOB-03',stance:'passive-defender',proximityAggro:0,provocation:'direct-hostile-damage',socialAggro:false,
  placementGroupMax:2,attackRange:1.7,telegraph:.45,leash:10,notes:'Пассивная крыса; без цепного агро по виду или группе.'},
 {mobId:'MOB-04',stance:'defends-when-struck',proximityAggro:0,provocation:'direct-hostile-damage',socialAggro:false,
  placementGroupMax:3,attackRange:2.4,telegraph:.8,leash:12,notes:'Живёт парой или тройкой для наблюдаемого обхода; каждый защищается после прямого удара, без social aggro. Разбег виден, после промаха пауза.'},
 {mobId:'MOB-05',stance:'passive-defender',proximityAggro:0,provocation:'direct-hostile-damage',socialAggro:false,
  placementGroupMax:1,attackRange:2.1,telegraph:.7,leash:10,notes:'Подъём панциря до толчка, без внезапного рывка.'},
] as const;
export const FIRST_HUNTING_GENERATOR_GATES_V3=[
 'Keep all existing safe cores, protected road and portal buffers.',
 'Passive species require real on-damage provocation; no proximity aggro fallback.',
 'Wolf pairs: independent LOS perception; next pair homes separated by both perception radii plus 3 m empty passage.',
 'Patrol envelopes and every maximum attack range stay outside safety buffers; test ranger range from both sides of the boundary.',
 'Any movement or incoming-damage trigger must not globally aggro species, zone or placement group.',
 'Do not silently cap live attackers. Repair spatial packing or implement explicit passive behavior.',
 'P0 groups of up to five are candidate placement groups, not proven encounter groups; repack P2 before activation.',
 'Return only after persistent disengagement conditions; preserve pursuit and do not refill HP on every backward step.',
] as const;

export function baseXpV3(level:number,difficulty=1):number{return Math.round(Math.floor(150*level**2.35)/(20+2.5*level)*difficulty);}
export function lootProfileV3(mobId:string){
 const number=Number(mobId.slice(4)),profile=LOOT_PROFILES_V3.find(p=>(p.mobs as readonly number[]).includes(number));
 if(!profile)throw Error('Missing loot profile '+mobId);return profile;
}
export function styleForMobV3(mobId:string):EncounterStyleV3{
 const n=Number(mobId.slice(4)),p=lootProfileV3(mobId).id;
 if([35,39,48].includes(n))return 'golem';
 if(p==='P04')return 'ranged';
 if(p==='P06'||[25,43,47,38,41].includes(n))return 'caster';
 if(p==='P05'||[28,37,45,36,40,42].includes(n))return 'heavy';
 if(p==='P02')return 'predator';
 return 'contact';
}
export function encounterV3(mobId:string,level:number){
 const mob=mobV3(mobId);if(level<mob.levelBand[0]||level>mob.levelBand[1])throw new RangeError('Level outside authored species band');
 const style=styleForMobV3(mobId),p=STYLE_STATS_V3[style],base=baseEncounterStatsV3(level),n=Number(mobId.slice(4));
 const type:EncounterDamageTypeV3=['caster'].includes(style)||[24,25,38,41,43,47].includes(n)?'magic':'physical';
 const element:EncounterElementV3=[35,36].includes(n)?'ice':[30,38,39,40,41,42].includes(n)?'fire':[6,12,14,18,23,24,27].includes(n)?'poison':[9,20,22,25,26,43,44,45,46,47,48].includes(n)?'shadow':'none';
 const resistances:ResistancesV3={};
 if([35,36].includes(n))resistances.ice=.25;
 if([39,40,41].includes(n))resistances.fire=.25;
 if([23,27].includes(n))resistances.poison=.2;
 if([25,43,47].includes(n))resistances.shadow=.2;
 const counter=style==='golem'||[21,28,29,32,34,37,40,42,45].includes(n);
 const early=FIRST_HUNTING_BEHAVIORS_V3.find(b=>b.mobId===mobId);
 return {mobId,speciesId:mob.speciesId,level,tier:BALANCE_BANDS_V3.find(b=>level>=b.min&&level<=b.max)!.id,style,
 hp:Math.round(base.hp*p.hp),atk:Math.round(base.atk*p.atk),def:Math.round(base.def*p.def),mdef:Math.round(base.mdef*p.mdef),
 accuracy:p.accuracy,attackInterval:p.interval,attackRange:Math.max(early?.attackRange??p.range,mob.actorRadius+.8),movementSpeed:p.speed,type,element,resistances,
 windup:early?.telegraph??(style==='golem'?1.15:style==='heavy'?.9:style==='caster'?.8:.45),recovery:style==='golem'?1.35:style==='heavy'?1.1:.7,
 counter:counter?{range:16,cooldown:7,windup:1.2,recovery:1.6,multiplier:1.2,type:style==='golem'?'magic' as const:'physical' as const,element,requiresLOS:true,pursuit:'real-navigation-no-teleport',mode:style==='golem'?'aimed-line':'directional-charge'}:null,
 behavior:early??null,
 encounterDesign:{targetActiveThreats:style==='heavy'||style==='golem'||style==='caster'?1:level<10?1:2,
  enforcement:'placement-or-passivity-review; not an artificial runtime aggro cap'},
 xp:baseXpV3(level,style==='golem'?1.5:style==='heavy'?1.2:style==='caster'||style==='ranged'?1:style==='predator'?.9:1),
 gold:baseGoldV3(level),goldRoll:[.9,1.1],lootProfile:lootProfileV3(mobId).id,runtimeEnabled:false};
}
export function miniEncounterV3(id:string){
 const boss=MINI_BOSSES_V3.find(b=>b.id===id);if(!boss)throw Error('Unknown V3 mini '+id);
 const base=baseEncounterStatsV3(boss.level),mob=mobV3(boss.visualArchetype),source=encounterV3(mob.id,Math.max(mob.levelBand[0],Math.min(mob.levelBand[1],boss.level)));
 return {...source,id,speciesId:boss.speciesId,level:boss.level,locationId:boss.locationId,kind:'mini',
 hp:Math.round(boss.level<30?2750+5*(boss.level-10):base.hp*(boss.level<50?10:12.3)),atk:Math.round(base.atk*1.3),
 def:Math.round(base.def*1.3),mdef:Math.round(base.mdef*1.3),xp:baseXpV3(boss.level)*8,gold:baseGoldV3(boss.level)*10,
 counter:{range:16,cooldown:8,windup:1.3,recovery:1.8,multiplier:1.4,type:source.type,element:source.element,requiresLOS:true,pursuit:'real-navigation-no-teleport',mode:'telegraphed-special'},
 encounterDesign:{targetActiveThreats:1,enforcement:'separate arena; not an artificial runtime aggro cap'},
 respawn:boss.respawn,loot:{equipment:.35,equipmentCategory:{weapon:.5,armor:.5},ring:boss.level>=25?.08:0,cloak:.05,core:boss.level>=25?.35:0,
  cloakId:boss.level<30?'cloak_defense':boss.level<60?'cloak_captain':'cloak_sky',
  ringFamily:boss.level<25?null:['RB-103','RB-105','RB-110'].includes(id)?'rift_ring_blade':['RB-107','RB-109','RB-112'].includes(id)?'ember_ring':'rift_ring_soul',
  coreItemId:boss.level<25?null:['RB-103','RB-105','RB-110'].includes(id)?'MAT-10':['RB-107','RB-109','RB-112'].includes(id)?'MAT-12':'MAT-11',
  coreCount:1,ringGrade:1,maxRingCount:1,
  guaranteedMaterialPool:boss.level<25?(id==='RB-101'?['MAT-01','MAT-05']:['MAT-01','MAT-04']):boss.level<50?['MAT-01','MAT-02','MAT-07','MAT-08']:['MAT-02','MAT-03','MAT-08','MAT-09'],
  guaranteedCount:[1,2,3],independentRolls:true},runtimeEnabled:false};
}
