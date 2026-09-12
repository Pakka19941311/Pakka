import {PROGRESSION_QUESTS,progressionQuestDefinition,progressionQuestHunt,progressionRewardStacks,progressionBookId} from '../data/progression-quests-v3.ts';
import type {ProgressionQuestId,ProgressionQuestDefinition,QuestRewardStack} from '../data/progression-quests-v3.ts';
import type {InventoryItem} from './inventory-commands.ts';
import type {StarterQuestState} from './starter-quests-v3.ts';
import {applyExperience} from './gameplay-session.ts';
import {MAX_LEVEL} from './game-rules.ts';
import {sameSpace,spaceOf,spatialDistance} from '../world/world-space.ts';
import type {SpatialPoint,SpaceId} from '../world/world-space.ts';

export type ProgressionQuestStatus='active'|'ready'|'reward-pending'|'claimed';
export type ProgressionQuestRecord={status:ProgressionQuestStatus;classId:string;acceptedAt:number;kills:number;killKeys:string[];evidence:string[];xpGranted:boolean;pendingItems:InventoryItem[];rewardChoice?:string;origin:'new'|'legacy-active'|'legacy-ready'|'legacy-claimed';prerequisiteExempt?:boolean};
export type ProgressionQuestLedger={version:1;quests:Partial<Record<ProgressionQuestId,ProgressionQuestRecord>>;legacy:{quest?:unknown;bookQuests?:Record<string,'active'|'ready'|'claimed'>;bookRewardBuffer?:InventoryItem[]};recoveredLegacyUids?:string[];reconciliations?:Array<{questId:ProgressionQuestId;previous:ProgressionQuestRecord;reason:'legacy-book-claimed'}>};
export type ProgressionQuestState=StarterQuestState&{id:string;bookQuests?:Record<string,'active'|'ready'|'claimed'>;progressionQuests?:ProgressionQuestLedger};
/** A future server adapter supplies only verified authoring bindings and actual eligible spawn quotas. Empty by default. */
export type ProgressionWorldBindings={revision:string;markers:Record<string,{runtimeId:string;locationId:string;spaceId:SpaceId}>;huntKeys:readonly string[]};
export const EMPTY_PROGRESSION_BINDINGS:ProgressionWorldBindings={revision:'unbound',markers:{},huntKeys:[]};
export type ProgressionServiceContext={npcId:string;position:SpatialPoint;now:number;heightDifference?:number;lineOfSight:(hero:SpatialPoint,npc:SpatialPoint)=>boolean};
export type ProgressionQuestEvent=
 |{kind:'kill';creditedHeroId:string;entityUid:string;generation:number;speciesId:string;level:number;subzoneId:string;locationId:string;spaceId:SpaceId}
 |{kind:'marker';runtimeId:string;locationId:string;spaceId:SpaceId}
 |{kind:'service';npcId:string};
export type QuestRewardDefinition={slot?:string;type?:string;maxStack?:number};
export type ProgressionQuestView={id:ProgressionQuestId;title:string;level:number;giverId:string;status:'available'|'locked'|'active'|'ready'|'pending'|'claimed';xp:number;rewards:QuestRewardStack[];rewardChoices:QuestRewardStack[];rewardChoice?:string;objectives:Array<{id:string;text:string;complete:boolean;count?:number;required?:number}>;pendingItemCount:number;requirementsAvailable:boolean;prerequisite?:ProgressionQuestId;legacyCredit:boolean};

const emptyRecord=(classId:string,now:number):ProgressionQuestRecord=>({status:'active',classId,acceptedAt:now,kills:0,killKeys:[],evidence:[],xpGranted:false,pendingItems:[],origin:'new'});
const submitted=(record:ProgressionQuestRecord|undefined)=>Boolean(record&&['claimed','reward-pending'].includes(record.status));
export const progressionHuntKey=(questId:string,classId:string)=>`${questId}:${classId}`;
/** Old quest 0..4 is not an index into this catalogue. Only exact class book IDs are an entitlement mapping. */
export function initializeProgressionQuests<T extends ProgressionQuestState>(state:T):T{
 if(state.progressionQuests&&state.progressionQuests.version!==1)throw Error('unsupported-progression-quests');
 const next=structuredClone(state);
 next.progressionQuests??={version:1,quests:{},legacy:structuredClone({quest:state.quest,bookQuests:state.bookQuests,bookRewardBuffer:state.lootBuffer?.filter(i=>i.id===`book_${state.classId}_50`||i.id===`book_${state.classId}_60`)})};
 for(const level of [50,60] as const){
  const id:ProgressionQuestId=level===50?'QUEST-150':'QUEST-160',bookId=progressionBookId(state.classId,level),legacy=next.bookQuests?.[bookId];
  let record=next.progressionQuests.quests[id];
  if(record&&record.classId!==state.classId)throw Error('quest-class-changed');
  if(legacy&&!['active','ready','claimed'].includes(legacy))throw Error('unsupported-legacy-book-state');
  if(legacy&&!record){
   record={...emptyRecord(state.classId,0),status:legacy,origin:`legacy-${legacy}`,xpGranted:legacy==='claimed',...(level===60&&legacy!=='claimed'?{prerequisiteExempt:true}:{})};
   next.progressionQuests.quests[id]=record;
  }else if(legacy==='claimed'&&record&&!submitted(record)){
   next.progressionQuests.reconciliations??=[];next.progressionQuests.reconciliations.push({questId:id,previous:structuredClone(record),reason:'legacy-book-claimed'});
   Object.assign(record,{status:'claimed',origin:'legacy-claimed',xpGranted:true,pendingItems:[]});
  }else if(legacy==='ready'&&record?.status==='active'){
   record.status='ready';record.origin='legacy-ready';if(level===60)record.prerequisiteExempt=true;
  }
  if(record?.origin==='legacy-claimed'&&record.status==='claimed'){
   const index=next.lootBuffer?.findIndex(i=>i.id===bookId)??-1,owned=next.lootBuffer?.[index];
   if(owned){
    if((next.progressionQuests.recoveredLegacyUids??[]).includes(owned.uid)||allItems(next).filter(i=>i.uid===owned.uid).length!==1)throw Error('ambiguous-legacy-book');
    next.lootBuffer!.splice(index,1);record.pendingItems=[owned];record.status='reward-pending';
    next.progressionQuests.recoveredLegacyUids??=[];next.progressionQuests.recoveredLegacyUids.push(owned.uid);
   }
  }
  if(record){next.bookQuests??={};next.bookQuests[bookId]=submitted(record)?'claimed':record.status==='ready'?'ready':'active';}
 }
 return next;
}
export function progressionRequirementsAvailable(quest:ProgressionQuestDefinition,classId:string,bindings:ProgressionWorldBindings):boolean{
 const markers=quest.markers.map(marker=>bindings.markers[marker.id]);
 if(markers.some((bound,i)=>!bound||!bound.runtimeId||bound.locationId!==quest.markers[i].locationId||bound.spaceId!==quest.markers[i].spaceId)||new Set(markers.map(m=>m?.runtimeId)).size!==markers.length)return false;
 return !progressionQuestHunt(quest.id,classId)||bindings.huntKeys.includes(progressionHuntKey(quest.id,classId));
}
function atGiver(state:ProgressionQuestState,quest:ProgressionQuestDefinition,context:ProgressionServiceContext):void{
 if(state.dead||state.hp<=0)throw Error('dead');
 if(!Number.isSafeInteger(state.level)||state.level<1||state.level>MAX_LEVEL||!Number.isSafeInteger(state.xp)||state.xp<0)throw Error('invalid-quest-progression');
 if(context.npcId!==quest.giverId||![state.x,state.z,context.position.x,context.position.z,context.now,context.heightDifference??0].every(Number.isFinite)||
  !sameSpace(state,context.position)||Math.hypot(spatialDistance(state,context.position),context.heightDifference??0)>3.2||!context.lineOfSight(state,context.position))throw Error('quest-giver-unavailable');
}
function complete(state:ProgressionQuestState,quest:ProgressionQuestDefinition,record:ProgressionQuestRecord):boolean{
 if(record.origin==='legacy-ready'||record.origin==='legacy-claimed')return true;
 const hunt=progressionQuestHunt(quest.id,state.classId);
 return (!hunt||record.kills>=hunt.count)&&quest.markers.every(marker=>record.evidence.includes(marker.id))&&(!quest.returnToGiver||record.evidence.includes('returned-to-giver'));
}
export function acceptProgressionQuest<T extends ProgressionQuestState>(state:T,questId:string,context:ProgressionServiceContext,bindings:ProgressionWorldBindings=EMPTY_PROGRESSION_BINDINGS):T{
 const quest=progressionQuestDefinition(questId);atGiver(state,quest,context);const next=initializeProgressionQuests(state);
 if(next.progressionQuests!.quests[quest.id])return next;
 if(state.level<quest.level)throw Error('quest-level');
 if(quest.prerequisite&&!submitted(next.progressionQuests!.quests[quest.prerequisite]))throw Error('quest-prerequisite');
 if(!progressionRequirementsAvailable(quest,state.classId,bindings))throw Error('quest-world-not-ready');
 next.progressionQuests!.quests[quest.id]=emptyRecord(state.classId,context.now);
 if(quest.bookLevel){next.bookQuests??={};next.bookQuests[progressionBookId(state.classId,quest.bookLevel)]='active';}
 return next;
}
/** Internal death, authored-marker and validated-service events; never expose this as a client completion endpoint. */
export function recordProgressionQuestEvent<T extends ProgressionQuestState>(state:T,event:ProgressionQuestEvent,bindings:ProgressionWorldBindings=EMPTY_PROGRESSION_BINDINGS):T{
 if(!state.progressionQuests)return state;
 const next=initializeProgressionQuests(state);
 for(const quest of PROGRESSION_QUESTS){
  const record=next.progressionQuests!.quests[quest.id];if(!record||!['active','ready'].includes(record.status))continue;
  if(record.classId!==state.classId)throw Error('quest-class-changed');
  const hunt=progressionQuestHunt(quest.id,state.classId);
  if(event.kind==='kill'&&hunt&&record.kills<hunt.count&&bindings.huntKeys.includes(progressionHuntKey(quest.id,state.classId))&&event.creditedHeroId===state.id&&
   (event.speciesId===hunt.speciesId||event.speciesId===hunt.mobId)&&event.subzoneId===hunt.subzoneId&&event.locationId===hunt.locationId&&event.spaceId===hunt.spaceId&&spaceOf(state)===event.spaceId&&Number.isSafeInteger(event.level)&&event.level>=hunt.levelMin&&event.level<=hunt.levelMax){
   if(!event.entityUid||!Number.isSafeInteger(event.generation)||event.generation<0)throw Error('invalid-quest-kill');
   const key=JSON.stringify([event.entityUid,event.generation]);if(!record.killKeys.includes(key)){record.killKeys.push(key);record.kills++;}
  }
  if(event.kind==='marker'&&!state.dead&&state.hp>0&&spaceOf(state)===event.spaceId){
   for(const marker of quest.markers){const bound=bindings.markers[marker.id];
    if(bound&&bound.runtimeId===event.runtimeId&&bound.locationId===marker.locationId&&bound.spaceId===marker.spaceId&&event.locationId===marker.locationId&&event.spaceId===marker.spaceId&&
     progressionRequirementsAvailable(quest,state.classId,bindings)&&!record.evidence.includes(marker.id))record.evidence.push(marker.id);
   }
  }
  if(event.kind==='service'&&!state.dead&&state.hp>0&&quest.returnToGiver&&event.npcId===quest.giverId&&quest.markers.every(marker=>record.evidence.includes(marker.id))&&!record.evidence.includes('returned-to-giver'))record.evidence.push('returned-to-giver');
  if(complete(next,quest,record)){record.status='ready';if(quest.bookLevel){next.bookQuests??={};next.bookQuests[progressionBookId(state.classId,quest.bookLevel)]='ready';}}
 }
 return next;
}
function allItems(state:ProgressionQuestState):InventoryItem[]{
 return [...state.inventory,...Object.values(state.equipment),...(state.storage??[]),...(state.lootBuffer??[]),...(state.migrationReserve??[]),
  ...Object.values(state.starterProgress?.quests??{}).flatMap(q=>q?.pendingItems??[]),...Object.values(state.progressionQuests?.quests??{}).flatMap(q=>q?.pendingItems??[])].filter((i):i is InventoryItem=>Boolean(i));
}
export function claimProgressionQuest<T extends ProgressionQuestState>(state:T,request:{questId:string;rewardChoice?:string},context:ProgressionServiceContext,identifier:()=>string,definitionFor:(id:string)=>QuestRewardDefinition|undefined){
 const quest=progressionQuestDefinition(request.questId);atGiver(state,quest,context);const next=initializeProgressionQuests(state),record=next.progressionQuests!.quests[quest.id];
 if(!record)throw Error('quest-not-accepted');
 const outcome={questId:quest.id,status:record.status,xpAwarded:0,delivered:[] as Array<{id:string;count:number;inventoryUid:string}>,pendingItemUids:[] as string[]};
 if(record.status==='claimed')return {state:next,outcome};
 if(record.classId!==state.classId)throw Error('quest-class-changed');
 if(record.status!=='reward-pending'&&!complete(next,quest,record))throw Error('quest-not-ready');
 const all=allItems(next),used=new Set(all.map(i=>i.uid));if(all.length!==used.size)throw Error('ambiguous-item');
 if(next.inventory.length>42)throw Error('bag-full');
 const policy=(id:string)=>{const definition=definitionFor(id);if(!definition)throw Error('unknown-quest-reward');if(definition.slot)throw Error('quest-gear-reward-forbidden');return {stackable:definition.type!=='book',maxStack:definition.maxStack??Number.MAX_SAFE_INTEGER};};
 if(record.status!=='reward-pending'){
  if(record.xpGranted||record.pendingItems.length)throw Error('invalid-quest-entitlement');
  const rewards=progressionRewardStacks(quest.id,state.classId,request.rewardChoice);for(const reward of rewards){const p=policy(reward.id);if(!Number.isSafeInteger(reward.count)||reward.count<1||reward.count>p.maxStack)throw Error('invalid-quest-reward');}
  record.pendingItems=rewards.map(reward=>{const uid=identifier();if(typeof uid!=='string'||!uid||used.has(uid))throw Error('duplicate-reward-uid');used.add(uid);return {uid,id:reward.id,plus:0,count:reward.count};});
  if(request.rewardChoice!==undefined)record.rewardChoice=request.rewardChoice;
  const gained=applyExperience(next.level,next.xp,quest.xp);next.level=gained.level;next.xp=gained.xp;record.xpGranted=true;outcome.xpAwarded=quest.xp;
 }else{
  if(!record.xpGranted)throw Error('invalid-quest-entitlement');
  if(request.rewardChoice!==undefined&&request.rewardChoice!==record.rewardChoice)throw Error('quest-reward-choice-locked');
 }
 const retained:InventoryItem[]=[];
 for(const item of record.pendingItems){
  const p=policy(item.id);let remaining=item.count;
  if(p.stackable)for(const stack of next.inventory){
   if(stack.id!==item.id||stack.plus!==0||!Number.isSafeInteger(stack.count)||stack.count<1||stack.count>=p.maxStack)continue;
   const amount=Math.min(remaining,p.maxStack-stack.count);stack.count+=amount;remaining-=amount;outcome.delivered.push({id:item.id,count:amount,inventoryUid:stack.uid});if(!remaining)break;
  }
  if(remaining&&next.inventory.length<42){next.inventory.push({...item,count:remaining});outcome.delivered.push({id:item.id,count:remaining,inventoryUid:item.uid});remaining=0;}
  if(remaining)retained.push({...item,count:remaining});
 }
 record.pendingItems=retained;record.status=retained.length?'reward-pending':'claimed';
 if(quest.bookLevel){next.bookQuests??={};next.bookQuests[progressionBookId(state.classId,quest.bookLevel)]='claimed';}
 outcome.status=record.status;outcome.pendingItemUids=retained.map(i=>i.uid);return {state:next,outcome};
}
export function progressionQuestViews(state:ProgressionQuestState,bindings:ProgressionWorldBindings=EMPTY_PROGRESSION_BINDINGS):ProgressionQuestView[]{
 const current=initializeProgressionQuests(state);
 return PROGRESSION_QUESTS.map(quest=>{
  const record=current.progressionQuests!.quests[quest.id],hunt=progressionQuestHunt(quest.id,state.classId);
  let objectives:ProgressionQuestView['objectives']=quest.markers.map(marker=>({id:marker.id,text:marker.text,complete:record?.evidence.includes(marker.id)??false}));
  if(hunt)objectives.unshift({id:'hunt',text:`${hunt.name}: ${hunt.count}, ${hunt.areaName}, уровень ${hunt.levelMin===hunt.levelMax?hunt.levelMin:hunt.levelMin+'–'+hunt.levelMax}`,complete:(record?.kills??0)>=hunt.count,count:record?.kills??0,required:hunt.count});
  if(quest.returnToGiver)objectives.push({id:'returned-to-giver',text:'Вернуться к Роэну после разведки',complete:record?.evidence.includes('returned-to-giver')??false});
  if(record&&['legacy-ready','legacy-claimed'].includes(record.origin))objectives=[{id:'legacy-completed',text:'Прежние условия выполнены; повторная охота не требуется',complete:true}];
  const available=progressionRequirementsAvailable(quest,state.classId,bindings),unlocked=state.level>=quest.level&&(!quest.prerequisite||submitted(current.progressionQuests!.quests[quest.prerequisite]));
  return {id:quest.id,title:quest.title,level:quest.level,giverId:quest.giverId,status:record?(record.status==='reward-pending'?'pending':record.status):unlocked?'available':'locked',
   xp:quest.xp,rewards:quest.rewardChoices?[]:progressionRewardStacks(quest.id,state.classId),rewardChoices:quest.rewardChoices?.map(r=>({...r}))??[],objectives,
   pendingItemCount:record?.pendingItems.length??0,requirementsAvailable:available,prerequisite:quest.prerequisite,legacyCredit:Boolean(record&&record.origin!=='new'),...(record?.rewardChoice?{rewardChoice:record.rewardChoice}:{})};
 });
}
