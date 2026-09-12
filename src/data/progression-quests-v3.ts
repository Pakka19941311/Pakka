import {MOBS_V3,HUNTING_ZONES_V3} from './world-expansion-v3.ts';
import {SKILL_BOOKS} from './skill-books.ts';
import {STARTER_CLASSES} from './starter-progression-v3.ts';
import type {StarterClass} from './starter-progression-v3.ts';
import type {SpaceId} from '../world/world-space.ts';

export const PROGRESSION_QUEST_CATALOG_VERSION='progression-quests-v3-1';
export const PROGRESSION_QUEST_RUNTIME_STATUS='staged-not-integrated';
export type ProgressionQuestId='QUEST-110'|'QUEST-115'|'QUEST-120'|'QUEST-125'|'QUEST-130'|'QUEST-131'|'QUEST-140'|'QUEST-141'|'QUEST-150'|'QUEST-160';
export type QuestRewardStack={id:string;count:number};
export type QuestMarker={id:string;text:string;locationId:string;spaceId:SpaceId};
export type QuestHunt={mobId:string;speciesId:string;name:string;subzoneId:string;areaName:string;locationId:string;spaceId:SpaceId;levelMin:number;levelMax:number;count:number};
export type ProgressionQuestDefinition={id:ProgressionQuestId;title:string;level:number;fraction:number;xp:number;giverId:'npc:elder'|'npc:books';markers:readonly QuestMarker[];hunt?:QuestHunt;classHunts?:Record<StarterClass,QuestHunt>;returnToGiver?:boolean;rewards:readonly QuestRewardStack[];rewardChoices?:readonly QuestRewardStack[];bookLevel?:50|60;prerequisite?:ProgressionQuestId};
const marker=(id:string,text:string,locationId:string,spaceId:SpaceId='surface'):QuestMarker=>({id,text,locationId,spaceId});
const hunt=(mobId:string,subzoneId:string,levelMin:number,levelMax:number,count:number):QuestHunt=>{
 const mob=MOBS_V3.find(m=>m.id===mobId),zone=HUNTING_ZONES_V3.find(z=>z.id===subzoneId);
 if(!mob||!zone||!zone.counts.some(c=>c.mobId===mobId))throw Error('invalid-progression-hunt:'+mobId+':'+subzoneId);
 return {mobId,speciesId:mob.speciesId,name:mob.name,subzoneId,areaName:zone.name,locationId:zone.locationId,spaceId:zone.spaceId,levelMin,levelMax,count};
};
const trials50:Record<StarterClass,QuestHunt>={
 knight:hunt('MOB-29','L10-C',48,50,8),mage:hunt('MOB-28','L08-A',48,50,8),ranger:hunt('MOB-30','L08-A',50,50,8),
 assassin:hunt('MOB-30','L08-A',50,50,8),necro:hunt('MOB-29','L10-C',48,50,8),
};
const trials60:Record<StarterClass,QuestHunt>={
 knight:hunt('MOB-35','L04-B',60,60,6),mage:hunt('MOB-37','L08-B',60,60,8),ranger:hunt('MOB-34','L04-B',58,60,8),
 assassin:hunt('MOB-37','L08-B',60,60,8),necro:hunt('MOB-36','L04-C',60,60,8),
};
/** Frozen rewards: round(floor(150 * L^2.35) * fraction), using the accepted quest level, never the hero level or live XP rate. */
export const PROGRESSION_QUESTS:readonly ProgressionQuestDefinition[]=[
 {id:'QUEST-110',title:'Два просвета',level:10,fraction:.12,xp:4030,giverId:'npc:elder',markers:[marker('q110:outlook-a','Первая обзорная точка опушки','L03'),marker('q110:outlook-b','Вторая обзорная точка опушки','L03')],rewards:[{id:'potion',count:3}]},
 {id:'QUEST-115',title:'Следы у кромки',level:15,fraction:.15,xp:13062,giverId:'npc:elder',markers:[],hunt:hunt('MOB-06','L03-A',10,14,8),rewards:[{id:'ether',count:2}]},
 {id:'QUEST-120',title:'Разведка отмелей',level:20,fraction:.12,xp:20544,giverId:'npc:elder',markers:[marker('q120:shore-a','Первый дальний берег','L06'),marker('q120:shore-b','Второй дальний берег','L06')],rewards:[{id:'mat_01',count:3},{id:'mat_07',count:2}]},
 {id:'QUEST-125',title:'Подходы к выработкам',level:25,fraction:.15,xp:43385,giverId:'npc:elder',markers:[marker('q125:mine-exterior','Разведать наружный комплекс выработок','L05')],rewards:[],rewardChoices:[{id:'weapon_scroll',count:1},{id:'armor_scroll',count:1}]},
 {id:'QUEST-130',title:'Угольные отметки',level:30,fraction:.10,xp:44394,giverId:'npc:elder',markers:['a','b','c'].map(id=>marker('q130:chamber-'+id,'Рабочая камера '+id.toUpperCase(),'L05','mine')),rewards:[]},
 {id:'QUEST-131',title:'Три каменных знака',level:30,fraction:.10,xp:44394,giverId:'npc:elder',markers:['a','b','c'].map(id=>marker('q131:street-'+id,'Каменный знак '+id.toUpperCase(),'L08')),rewards:[]},
 {id:'QUEST-140',title:'Край глухой воды',level:40,fraction:.10,xp:87284,giverId:'npc:elder',markers:[marker('q140:swamp-a','Первый болотный ориентир','L11'),marker('q140:swamp-b','Второй болотный ориентир','L11')],rewards:[]},
 {id:'QUEST-141',title:'Свод над озером',level:40,fraction:.10,xp:87284,giverId:'npc:elder',markers:[marker('q141:cave-route','Разведать пещерный маршрут','L07','great_cave')],returnToGiver:true,rewards:[]},
 {id:'QUEST-150',title:'Знание класса I',level:50,fraction:.15,xp:221188,giverId:'npc:books',markers:[],classHunts:trials50,rewards:[],bookLevel:50},
 {id:'QUEST-160',title:'Знание класса II',level:60,fraction:.15,xp:339498,giverId:'npc:books',markers:[],classHunts:trials60,rewards:[],bookLevel:60,prerequisite:'QUEST-150'},
];
export function progressionQuestDefinition(id:string):ProgressionQuestDefinition{
 const definition=PROGRESSION_QUESTS.find(q=>q.id===id);if(!definition)throw Error('unknown-progression-quest');return definition;
}
export function progressionQuestHunt(id:string,classId:string):QuestHunt|undefined{
 if(!STARTER_CLASSES.includes(classId as StarterClass))throw Error('invalid-quest-class');
 const quest=progressionQuestDefinition(id);return quest.classHunts?.[classId as StarterClass]??quest.hunt;
}
export function progressionBookId(classId:string,level:50|60):string{
 const id=`book_${classId}_${level}`,book=SKILL_BOOKS[id];
 if(!book||book.classId!==classId||book.level!==level)throw Error('unknown-class-book');return id;
}
export function progressionRewardStacks(id:string,classId:string,choice?:string):QuestRewardStack[]{
 const quest=progressionQuestDefinition(id);progressionQuestHunt(id,classId);
 if(quest.rewardChoices){const selected=quest.rewardChoices.find(r=>r.id===choice);if(!selected)throw Error('quest-reward-choice-required');return [{...selected}];}
 if(choice!==undefined)throw Error('unexpected-quest-reward-choice');
 return quest.bookLevel?[{id:progressionBookId(classId,quest.bookLevel),count:1}]:quest.rewards.map(r=>({...r}));
}
