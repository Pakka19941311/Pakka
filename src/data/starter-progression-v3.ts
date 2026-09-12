import {MOBS_V3} from './world-expansion-v3.ts';
import type {ItemStatDefinition} from '../core/item-progression.ts';

export const STARTER_CLASSES=['knight','ranger','assassin','mage','necro'] as const;
export type StarterClass=typeof STARTER_CLASSES[number];
const gear=(name:string,slot:string,stats:ItemStatDefinition,buyPrice:number,classes:readonly string[]=STARTER_CLASSES)=>({
 ...stats,name,slot,icon:slot==='weapon'?'⚔':'▱',category:'starter',requiredLevel:1,value:buyPrice,buyPrice,classes,assassinForeign:false,
});
/** One definition is used by both the quest reward and the smith's shop. Existing starter loadouts remain intact. */
export const STARTER_ITEMS={
 starter_weapon_knight:gear('Учебный меч','weapon',{atk:[8,12]},90,['knight']),
 starter_weapon_ranger:gear('Учебный лук','weapon',{atk:[7,11],accuracy:2},90,['ranger']),
 starter_weapon_assassin:gear('Учебные клинки','weapon',{atk:[6,10],crit:1},90,['assassin']),
 starter_weapon_mage:gear('Учебный посох','weapon',{matk:14,atk:[4,8]},90,['mage']),
 starter_weapon_necro:gear('Учебный гримуар','weapon',{matk:14,atk:[9,13]},90,['necro']),
 starter_chest_knight:gear('Нагрудник ученика дозора','chest',{def:8,hp:20},70,['knight']),
 starter_chest_ranger:gear('Куртка ученика следопыта','chest',{def:6,accuracy:1},70,['ranger']),
 starter_chest_assassin:gear('Кожанка ученика тени','chest',{def:5,evasion:2},70,['assassin']),
 starter_chest_mage:gear('Мантия ученика круга','chest',{def:2,mdef:8,mp:20},70,['mage']),
 starter_chest_necro:gear('Облачение ученика ритуала','chest',{def:3,mdef:7,mp:15},70,['necro']),
 starter_head:gear('Шлем новичка','head',{def:2},30),
 starter_gloves:gear('Перчатки новичка','gloves',{def:1},20),
 starter_boots:gear('Сапоги новичка','boots',{def:1},25),
 starter_belt:gear('Пояс новичка','belt',{def:1,hp:10},25),
};
export type StarterItemId=keyof typeof STARTER_ITEMS;
export type StarterQuestId='QUEST-101'|'QUEST-102'|'QUEST-103'|'QUEST-104'|'QUEST-105';
export type StarterEvidence='outskirts-inspected'|'returned-to-service'|'target-confirmed'|'movement-cancelled'|'boar-approach'|'boar-flank'|'boar-retreat'|'returned-to-city';
export type StarterQuestDefinition={id:StarterQuestId;name:string;minLevel:number;mobId:string;speciesId:string;killCount:number;xp:number;evidence:readonly StarterEvidence[];reward:'weapon'|'chest'|readonly StarterItemId[]};
const species=(id:string)=>{const mob=MOBS_V3.find(m=>m.id===id);if(!mob)throw Error('missing-starter-species:'+id);return mob.speciesId;};
export const STARTER_QUESTS:readonly StarterQuestDefinition[]=[
 {id:'QUEST-101',name:'Первый дозор',minLevel:1,mobId:'MOB-01',speciesId:species('MOB-01'),killCount:5,xp:120,evidence:['outskirts-inspected'],reward:'weapon'},
 {id:'QUEST-102',name:'Гончие у дороги',minLevel:5,mobId:'MOB-02',speciesId:species('MOB-02'),killCount:5,xp:1200,evidence:['returned-to-service'],reward:'chest'},
 {id:'QUEST-103',name:'Внимательный охотник',minLevel:1,mobId:'MOB-03',speciesId:species('MOB-03'),killCount:4,xp:40,evidence:['target-confirmed','movement-cancelled'],reward:['starter_gloves']},
 {id:'QUEST-104',name:'Путь вокруг стада',minLevel:3,mobId:'MOB-04',speciesId:species('MOB-04'),killCount:4,xp:450,evidence:['boar-approach','boar-flank','boar-retreat'],reward:['starter_boots']},
 {id:'QUEST-105',name:'Домой до темноты',minLevel:7,mobId:'MOB-05',speciesId:species('MOB-05'),killCount:6,xp:2500,evidence:['returned-to-city'],reward:['starter_head','starter_belt']},
];
export const STARTER_SERVICE_ID='npc:elder';
export const STARTER_LOCATION_ID='L02';
export const STARTER_OUTSKIRTS_CHECKPOINT='starter:greenfall-outskirts';
export const STARTER_BOAR_ROUTE='starter:boar-bypass';
export const STARTER_MONSTER_NAMES:Record<string,string>=Object.fromEntries(MOBS_V3.map(m=>[m.speciesId,m.name]));
export const STARTER_EVIDENCE_TEXT:Record<StarterEvidence,string>={
 'outskirts-inspected':'Осмотреть окраину: остановиться на секунду рядом со слизнями вне их зоны агрессии',
 'returned-to-service':'После охоты вернуться к городской услуге',
 'target-confirmed':'Выбрать полевую крысу целью',
 'movement-cancelled':'Отменить начатое движение',
 'boar-approach':'Подойти к кабанам на безопасную дистанцию',
 'boar-flank':'Обойти живую группу примерно на четверть круга вне зоны агрессии',
 'boar-retreat':'Отойти от группы ещё на 24 метра без преследования',
 'returned-to-city':'После охоты безопасно вернуться в Гринфолл',
};
export function starterQuestDefinition(id:string):StarterQuestDefinition{
 const definition=STARTER_QUESTS.find(q=>q.id===id);if(!definition)throw Error('unknown-starter-quest');return definition;
}
export function starterRewardIds(questId:string,classId:string):StarterItemId[]{
 const quest=starterQuestDefinition(questId);
 if(!STARTER_CLASSES.includes(classId as StarterClass))throw Error('invalid-quest-class');
 return typeof quest.reward==='string'?[`starter_${quest.reward}_${classId}` as StarterItemId]:[...quest.reward];
}
