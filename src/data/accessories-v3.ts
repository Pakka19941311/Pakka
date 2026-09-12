import type {ItemStatDefinition} from '../core/item-progression.ts';
export const ACCESSORY_MIGRATION_VERSION=1;
export type RingFamily='str'|'dex'|'int'|'blade'|'soul'|'ember';
const classes=['knight','mage','ranger','necro','assassin'];
const ring=(name:string,ringFamily:RingFamily,ringGrade:1|2|3,stats:ItemStatDefinition,value:number)=>({
  ...stats,name:`${name} ${['I','II','III'][ringGrade-1]}`,slot:'ring',icon:'○',classes,assassinForeign:false,
  ringFamily,ringGrade,requiredLevel:(['str','dex','int'].includes(ringFamily)?[10,35,65]:[25,45,65])[ringGrade-1],
  value,enhanceable:false,
});
export const RING_ITEMS={
 ring_str_g1:ring('Кольцо силы','str',1,{str:1},200),
 ring_str_g2:ring('Кольцо силы','str',2,{str:2,hp:15},750),
 ring_str_g3:ring('Кольцо силы','str',3,{str:4,hp:30,accuracy:1},3000),
 ring_dex_g1:ring('Кольцо ловкости','dex',1,{dex:1},200),
 ring_dex_g2:ring('Кольцо ловкости','dex',2,{dex:2,accuracy:1},750),
 ring_dex_g3:ring('Кольцо ловкости','dex',3,{dex:4,accuracy:2,evasion:1},3000),
 ring_int_g1:ring('Кольцо интеллекта','int',1,{int:1},200),
 ring_int_g2:ring('Кольцо интеллекта','int',2,{int:2,mp:15},750),
 ring_int_g3:ring('Кольцо интеллекта','int',3,{int:4,mp:30,mdef:1},3000),
 rift_ring_blade:ring('Кольцо пепельного клинка','blade',1,{atk:[2,3],crit:1},650),
 rift_ring_blade_g2:ring('Кольцо пепельного клинка','blade',2,{atk:[4,6],crit:2},650),
 rift_ring_blade_g3:ring('Кольцо пепельного клинка','blade',3,{atk:[6,9],crit:3},650),
 rift_ring_soul:ring('Кольцо морозной души','soul',1,{matk:9,crit:3},650),
 rift_ring_soul_g2:ring('Кольцо морозной души','soul',2,{matk:12,crit:4},650),
 rift_ring_soul_g3:ring('Кольцо морозной души','soul',3,{matk:16,crit:5},650),
 ember_ring:ring('Кольцо тлеющего угля','ember',1,{matk:8,crit:3},420),
 ember_ring_g2:ring('Кольцо тлеющего угля','ember',2,{matk:11,crit:4},420),
 ember_ring_g3:ring('Кольцо тлеющего угля','ember',3,{matk:15,crit:5},420),
};
export const CLOAK_ITEMS={
 cloak_defense:{name:'Плащ защиты',slot:'cloak',icon:'▱',def:2,requiredLevel:10,value:350,buyPrice:350,classes,assassinForeign:false},
 cloak_captain:{name:'Плащ капитана',slot:'cloak',icon:'▱',def:1,mdef:2,str:1,dex:1,int:1,requiredLevel:30,value:0,classes,assassinForeign:false},
 cloak_sky:{name:'Крылья неба',slot:'cloak',icon:'▱',def:1,evasion:2,crit:2,requiredLevel:60,value:0,classes,assassinForeign:false},
};
const material=(name:string,sellValue:number)=>({name,type:'material',icon:'◆',value:sellValue,sellValue,maxStack:999});
export const CRAFT_MATERIAL_ITEMS={
 mat_01:material('Медный скол',2),mat_02:material('Очищенная руда',5),mat_03:material('Звёздный сплав',12),
 mat_04:material('Сгусток мощи',3),mat_05:material('Упругая жила',3),mat_06:material('Осколок маны',3),
 mat_07:material('Вязкая слизь',2),mat_08:material('Печать связи',10),mat_09:material('Руна восхождения',25),
 mat_10:material('Сердцевина каменного стража',50),mat_11:material('Холодная сердцевина',50),mat_12:material('Пепельная сердцевина',50),
 ring_blank:{name:'Заготовка кольца',type:'craft_base',icon:'○',value:50,buyPrice:50,maxStack:1},
};
export type RingRecipe={id:string;targetId:string;resultId:string;materials:Array<{id:string;count:number}>;fee:number;chance:number};
const familyMaterial:Record<RingFamily,string>={str:'mat_04',dex:'mat_05',int:'mat_06',blade:'mat_10',soul:'mat_11',ember:'mat_12'};
export const RING_RECIPES:RingRecipe[]=Object.entries(RING_ITEMS).flatMap(([id,item])=>{
 const basic=['str','dex','int'].includes(item.ringFamily),grade=item.ringGrade;
 if(!basic&&grade===1)return [];
 const previous=Object.entries(RING_ITEMS).find(([,d])=>d.ringFamily===item.ringFamily&&d.ringGrade===grade-1)?.[0];
 return [{id,targetId:grade===1?'ring_blank':previous!,resultId:id,
  materials:[{id:['mat_01','mat_02','mat_03'][grade-1],count:[5,10,8][grade-1]},
    {id:familyMaterial[item.ringFamily],count:basic?[3,6,12][grade-1]:grade===2?1:2},
    {id:['mat_07','mat_08','mat_09'][grade-1],count:grade===1?4:2}],
  fee:[150,750,3000][grade-1],chance:[.9,.7,.45][grade-1]}];
});
export const LEGACY_RING_IDS=['rift_ring_blade','rift_ring_soul','ember_ring'] as const;
export function itemSellPrice(definition:{value:number;sellValue?:number}):number{return definition.sellValue??Math.floor(definition.value*.48);}
