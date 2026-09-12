import {MOBS_V3,MINI_BOSSES_V3,MAJOR_BOSSES_V3} from './world-expansion-v3.ts';
type Drop={id:string;count:number};
type MaterialChance={id:string;chance:number;max:number};
const drop=(id:string,chance:number,max=1):MaterialChance=>({id,chance,max});
/** Canonical MOB IDs from the accepted bestiary; runtime names resolve through its staged data catalogue. */
export const MATERIAL_SOURCES:Record<string,MaterialChance[]>={
 'MOB-01':[drop('mat_06',.2),drop('mat_07',.25)],'MOB-02':[drop('mat_05',.2)],'MOB-04':[drop('mat_04',.2)],
 'MOB-05':[drop('mat_01',.22)],'MOB-14':[drop('mat_07',.25)],
 'MOB-17':[drop('mat_01',.22),drop('mat_02',.2,2),drop('mat_08',.15)],'MOB-19':[drop('mat_02',.2,2)],
 'MOB-20':[drop('mat_08',.15)],'MOB-21':[drop('mat_04',.35,2)],'MOB-25':[drop('mat_08',.15)],
 'MOB-30':[drop('mat_06',.35,2)],'MOB-31':[drop('mat_05',.35,2)],
 'MOB-35':[drop('mat_03',.18,2),drop('mat_09',.12)],'MOB-37':[drop('mat_03',.18,2),drop('mat_09',.12)],
 'MOB-39':[drop('mat_03',.18,2)],'MOB-43':[drop('mat_09',.12)],
};
const aliases:Record<string,string>={
 spider:'MOB-01',wolf:'MOB-02',miner:'MOB-17',undead:'MOB-20',wraith:'MOB-25',cultist:'MOB-30',ice_golem:'MOB-35',fire_golem:'MOB-39',
 ...Object.fromEntries(MOBS_V3.flatMap(mob=>[[mob.speciesId,mob.id],...(mob.legacySpeciesId?[[mob.legacySpeciesId,mob.id]]:[])])),
 ...Object.fromEntries(MINI_BOSSES_V3.map(boss=>[boss.speciesId,boss.id])),
 ...Object.fromEntries(MAJOR_BOSSES_V3.map(boss=>[boss.id,boss.speciesId])),
};
const large:Record<string,{ring:string;core:string;cloak:string}>={
 mini:{ring:'rift_ring_blade',core:'mat_10',cloak:'cloak_sky'},
 big:{ring:'rift_ring_blade',core:'mat_10',cloak:'cloak_captain'},
 rift_boss:{ring:'ember_ring',core:'mat_12',cloak:'cloak_sky'},
};
const miniLevels=[18,10,26,64,34,28,38,58,82,50,46,90];
const miniFamilies=['','','blade','soul','blade','soul','ember','soul','ember','blade','soul','ember'];
export function rollAccessoryLoot(id:string,random:()=>number):Drop[]{
 id=aliases[id]??id;
 if(id==='cave_boss')return [];
 const roll=()=>{const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('invalid-accessory-drop-roll');return value;};
 const result:Drop[]=[];const add=(id:string,count=1)=>result.push({id,count});
 const boss=large[id];
 if(boss){if(roll()<.2)add(boss.ring);if(roll()<.1)add(boss.cloak);add(boss.core);return result;}
 const number=/^RB-(10[1-9]|11[0-2])$/.test(id)?Number(id.slice(3))-101:-1;
 if(number>=0){
  const level=miniLevels[number],family=miniFamilies[number];
  const materialPool=level<25?['mat_01',number===0?'mat_05':'mat_04']:level<50?['mat_01','mat_02','mat_07','mat_08']:['mat_02','mat_03','mat_08','mat_09'];
  add(materialPool[Math.floor(roll()*materialPool.length)],1+Math.floor(roll()*3));
  if(family){const core=family==='blade'?'mat_10':family==='soul'?'mat_11':'mat_12';if(roll()<.35)add(core);if(roll()<.08)add(family==='ember'?'ember_ring':`rift_ring_${family}`);}
  if(roll()<.05)add(level<30?'cloak_defense':level<60?'cloak_captain':'cloak_sky');return result;
 }
 for(const source of MATERIAL_SOURCES[id]??[])if(roll()<source.chance)add(source.id,source.max===1?1:1+Math.floor(roll()*source.max));
 return result;
}
