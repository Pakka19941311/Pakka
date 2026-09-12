import {STARTER_QUESTS,STARTER_SERVICE_ID,STARTER_LOCATION_ID,STARTER_OUTSKIRTS_CHECKPOINT,STARTER_BOAR_ROUTE,STARTER_EVIDENCE_TEXT,STARTER_MONSTER_NAMES,starterQuestDefinition,starterRewardIds} from '../data/starter-progression-v3.ts';
import type {StarterQuestId,StarterEvidence} from '../data/starter-progression-v3.ts';
import type {InventoryItem} from './inventory-commands.ts';
import {applyExperience} from './gameplay-session.ts';
import {sameSpace,spatialDistance} from '../world/world-space.ts';
import type {SpatialPoint} from '../world/world-space.ts';

export type StarterQuestStatus='active'|'ready'|'reward-pending'|'claimed';
export type StarterQuestRecord={status:StarterQuestStatus;kills:number;killKeys:string[];evidence:StarterEvidence[];acceptedAt:number;xpGranted:boolean;pendingItems:InventoryItem[]};
export type StarterObservation={generation:number;lastAt:number;position:SpatialPoint;outsideAfterHunt?:boolean;slime?:{groupId:string;since:number};boar?:{groupId:string;center:SpatialPoint;radius:number;lastAngle:number;turn:number}};
export type StarterProgress={version:1;quests:Partial<Record<StarterQuestId,StarterQuestRecord>>;legacy?:{quest?:unknown;kills?:unknown;bossKills?:unknown};observation?:StarterObservation};
export type StarterQuestView={id:StarterQuestId;title:string;level:number;description:string;monsterId:string;requiredKills:number;kills:number;objectiveText:string;objectives:Array<{id:string;text:string;complete:boolean}>;status:'available'|'locked'|'active'|'ready'|'pending'|'claimed';rewards:string[];xp:number;pendingItemCount:number};
export type StarterQuestState=SpatialPoint&{classId:string;level:number;xp:number;hp:number;dead:boolean;inventory:InventoryItem[];equipment:Record<string,InventoryItem|undefined>;storage?:Array<InventoryItem|null>;lootBuffer?:InventoryItem[];migrationReserve?:InventoryItem[];starterProgress?:StarterProgress;quest?:unknown;kills?:unknown;bossKills?:unknown};
/** Supplied from the server's service registry and collision world, never from a command payload. */
export type StarterServiceContext={npcId:string;position:SpatialPoint;now:number;heightDifference?:number;lineOfSight:(hero:SpatialPoint,service:SpatialPoint)=>boolean};
/** Internal server evidence only. There is deliberately no client progress/complete command. */
export type StarterQuestEvent=
 |{kind:'kill';speciesId:string;entityUid:string;generation:number;locationId:string}
 |{kind:'inspect';checkpointId:string;locationId:string}
 |{kind:'service';npcId:string;locationId:string}
 |{kind:'target';speciesId:string;entityUid:string;generation:number;locationId:string}
 |{kind:'movementCancelled';hadMovement:true;locationId:string}
 |{kind:'routeCheckpoint';routeId:string;checkpoint:'approach'|'flank'|'retreat';locationId:string}
 |{kind:'cityReturn';cityId:'greenfall';safe:true;locationId:string};

export function initializeStarterQuests<T extends StarterQuestState>(state:T):T{
 if(state.starterProgress){if(state.starterProgress.version!==1)throw Error('unsupported-starter-quests');return state;}
 const next=structuredClone(state);
 next.starterProgress={version:1,quests:{},legacy:structuredClone({quest:state.quest,kills:state.kills,bossKills:state.bossKills})};
 // The old numeric quest and any historical quest records stay untouched. They cannot identify a new reward entitlement.
 return next;
}
export function starterQuestViews(state:StarterQuestState):StarterQuestView[]{
 return STARTER_QUESTS.map(quest=>{
  const record=state.starterProgress?.quests[quest.id],kills=record?.kills??0;
  const objectives=quest.evidence.map(id=>({id,text:STARTER_EVIDENCE_TEXT[id],complete:record?.evidence.includes(id)??false}));
  return {id:quest.id,title:quest.name,level:quest.minLevel,description:'Поручение Роэна: охота на окраинах Гринфолла и возвращение с результатом.',monsterId:quest.speciesId,
   requiredKills:quest.killCount,kills,objectiveText:`${STARTER_MONSTER_NAMES[quest.speciesId]}: ${quest.killCount}, окраины Гринфолла. ${objectives.map(o=>o.text).join('. ')}.`,objectives,
   status:record?(record.status==='reward-pending'?'pending':record.status):state.level>=quest.minLevel?'available':'locked',
   rewards:starterRewardIds(quest.id,state.classId),xp:quest.xp,pendingItemCount:record?.pendingItems.length??0};
 });
}
function atRoen(state:StarterQuestState,context:StarterServiceContext):void{
 if(state.dead||state.hp<=0)throw Error('dead');
 if(context.npcId!==STARTER_SERVICE_ID||![state.x,state.z,context.position.x,context.position.z,context.now,context.heightDifference??0].every(Number.isFinite)||
  !sameSpace(state,context.position)||Math.hypot(spatialDistance(state,context.position),context.heightDifference??0)>3.2||!context.lineOfSight(state,context.position))throw Error('elder-unavailable');
}
function ready(questId:StarterQuestId,record:StarterQuestRecord):boolean{
 const quest=starterQuestDefinition(questId);return record.kills>=quest.killCount&&quest.evidence.every(flag=>record.evidence.includes(flag));
}
export function acceptStarterQuest<T extends StarterQuestState>(state:T,questId:string,context:StarterServiceContext):T{
 const quest=starterQuestDefinition(questId);atRoen(state,context);
 if(state.level<quest.minLevel)throw Error('quest-level');
 const next=structuredClone(initializeStarterQuests(state));
 next.starterProgress!.quests[quest.id]??={status:'active',kills:0,killKeys:[],evidence:[],acceptedAt:context.now,xpGranted:false,pendingItems:[]};
 return next;
}
export function recordStarterQuestEvent<T extends StarterQuestState>(state:T,event:StarterQuestEvent):T{
 if(!state.starterProgress||event.locationId!==STARTER_LOCATION_ID)return state;
 if(state.starterProgress.version!==1)throw Error('unsupported-starter-quests');
 if(event.kind!=='kill'&&(state.dead||state.hp<=0))return state;
 const next=structuredClone(state);
 for(const quest of STARTER_QUESTS){
  const record=next.starterProgress!.quests[quest.id];if(!record||!['active','ready'].includes(record.status))continue;
  const add=(flag:StarterEvidence)=>{if(!record.evidence.includes(flag))record.evidence.push(flag);};
  if(event.kind==='kill'&&(event.speciesId===quest.speciesId||event.speciesId===quest.mobId)&&record.kills<quest.killCount){
   if(!event.entityUid||!Number.isSafeInteger(event.generation)||event.generation<0)throw Error('invalid-quest-kill');
   const key=JSON.stringify([event.entityUid,event.generation]);
   if(!record.killKeys.includes(key)){record.killKeys.push(key);record.kills++;}
  }
  if(quest.id==='QUEST-101'&&event.kind==='inspect'&&event.checkpointId===STARTER_OUTSKIRTS_CHECKPOINT)add('outskirts-inspected');
  if(quest.id==='QUEST-102'&&event.kind==='service'&&['npc:elder','npc:smith','npc:alchemist','npc:shop','npc:storage'].includes(event.npcId)&&record.kills>=quest.killCount)add('returned-to-service');
  if(quest.id==='QUEST-103'){
   if(event.kind==='target'&&(event.speciesId===quest.speciesId||event.speciesId===quest.mobId)&&event.entityUid&&Number.isSafeInteger(event.generation)&&event.generation>=0)add('target-confirmed');
   if(event.kind==='movementCancelled'&&event.hadMovement===true)add('movement-cancelled');
  }
  if(quest.id==='QUEST-104'&&event.kind==='routeCheckpoint'&&event.routeId===STARTER_BOAR_ROUTE){
   if(event.checkpoint==='approach')add('boar-approach');
   if(event.checkpoint==='flank'&&record.evidence.includes('boar-approach'))add('boar-flank');
   if(event.checkpoint==='retreat'&&record.evidence.includes('boar-flank'))add('boar-retreat');
  }
  if(quest.id==='QUEST-105'&&event.kind==='cityReturn'&&event.cityId==='greenfall'&&event.safe===true&&record.kills>=quest.killCount)add('returned-to-city');
  if(ready(quest.id,record))record.status='ready';
 }
 return next;
}
function ownedItems(state:StarterQuestState):InventoryItem[]{
 return [...state.inventory,...Object.values(state.equipment),...(state.storage??[]),...(state.lootBuffer??[]),...(state.migrationReserve??[]),
  ...Object.values(state.starterProgress?.quests??{}).flatMap(q=>q?.pendingItems??[])].filter((i):i is InventoryItem=>Boolean(i));
}
/** Pure draft. Persist returned state and the command receipt in the existing server transaction before acknowledging. */
export function claimStarterQuest<T extends StarterQuestState>(state:T,questId:string,context:StarterServiceContext,identifier:()=>string){
 const quest=starterQuestDefinition(questId);atRoen(state,context);
 const next=structuredClone(initializeStarterQuests(state)),record=next.starterProgress!.quests[quest.id];
 if(!record)throw Error('quest-not-accepted');
 if(record.status==='claimed')return {state:next,outcome:{questId:quest.id,status:record.status,xpAwarded:0,items:[] as InventoryItem[],pendingItemUids:[] as string[]}};
 if(record.status!=='reward-pending'&&!ready(quest.id,record))throw Error('quest-not-ready');
 const all=ownedItems(next),used=new Set(all.map(i=>i.uid));if(used.size!==all.length)throw Error('ambiguous-item');
 if(next.inventory.length>42)throw Error('bag-full');
 let xpAwarded=0;
 if(record.status!=='reward-pending'){
  if(record.xpGranted||record.pendingItems.length)throw Error('invalid-quest-entitlement');
  record.pendingItems=starterRewardIds(quest.id,next.classId).map(id=>{
   const uid=identifier();if(typeof uid!=='string'||!uid||used.has(uid))throw Error('duplicate-reward-uid');used.add(uid);return {uid,id,plus:0,count:1};
  });
  xpAwarded=quest.xp;const gained=applyExperience(next.level,next.xp,xpAwarded);next.level=gained.level;next.xp=gained.xp;
  record.xpGranted=true;
 }else if(!record.xpGranted)throw Error('invalid-quest-entitlement');
 const items=record.pendingItems.splice(0,Math.max(0,42-next.inventory.length));next.inventory.push(...items);
 record.status=record.pendingItems.length?'reward-pending':'claimed';
 return {state:next,outcome:{questId:quest.id,status:record.status,xpAwarded,items,pendingItemUids:record.pendingItems.map(i=>i.uid)}};
}
