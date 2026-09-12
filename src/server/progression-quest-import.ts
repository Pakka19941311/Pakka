import {progressionQuestDefinition,progressionQuestHunt,progressionRewardStacks} from '../data/progression-quests-v3.ts';
import type {ProgressionQuestId} from '../data/progression-quests-v3.ts';
import type {ProgressionQuestLedger,ProgressionQuestRecord} from '../core/progression-quests-v3.ts';
import type {InventoryItem} from '../core/inventory-commands.ts';
import {SKILL_BOOKS} from '../data/skill-books.ts';
const invalid=():never=>{throw Error('invalid-beta-save: original data retained');};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:invalid();
const integer=(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max?value:invalid();
export function parseLegacyBookQuests(value:unknown):Record<string,'active'|'ready'|'claimed'>|undefined{
 if(value===undefined)return undefined;
 const result:Record<string,'active'|'ready'|'claimed'>={};
 for(const [id,status] of Object.entries(record(value))){if(!SKILL_BOOKS[id]||![50,60].includes(SKILL_BOOKS[id].level)||!['active','ready','claimed'].includes(String(status)))invalid();result[id]=status as 'active'|'ready'|'claimed';}
 return result;
}
/** Private import validates pending items through the same global UID set as bag/equipment/storage. */
export function parseProgressionQuestLedger(value:unknown,classId:string,parseItem:(value:unknown)=>InventoryItem):ProgressionQuestLedger|undefined{
 if(value===undefined)return undefined;
 const raw=record(value);if(raw.version!==1)invalid();
 const result:ProgressionQuestLedger={version:1,quests:{},legacy:structuredClone(record(raw.legacy))};
 if(raw.reconciliations!==undefined){if(!Array.isArray(raw.reconciliations)||raw.reconciliations.length>20)invalid();result.reconciliations=structuredClone(raw.reconciliations) as ProgressionQuestLedger['reconciliations'];}
 if(raw.recoveredLegacyUids!==undefined){if(!Array.isArray(raw.recoveredLegacyUids)||raw.recoveredLegacyUids.length>20||raw.recoveredLegacyUids.some(id=>typeof id!=='string'||!id||id.length>200))invalid();result.recoveredLegacyUids=[...(raw.recoveredLegacyUids as string[])];}
 for(const [id,value] of Object.entries(record(raw.quests))){
  let definition;try{definition=progressionQuestDefinition(id);}catch{invalid();}const quest=definition!,q=record(value),hunt=progressionQuestHunt(id,classId);
  if(q.classId!==classId||!['active','ready','reward-pending','claimed'].includes(String(q.status))||!['new','legacy-active','legacy-ready','legacy-claimed'].includes(String(q.origin))||
   !quest.bookLevel&&q.origin!=='new'||typeof q.xpGranted!=='boolean'||typeof q.acceptedAt!=='number'||!Number.isFinite(q.acceptedAt)||q.acceptedAt<0||q.prerequisiteExempt!==undefined&&typeof q.prerequisiteExempt!=='boolean')invalid();
  const kills=integer(q.kills,0,hunt?.count??0),keys=q.killKeys,evidence=q.evidence,allowed=[...quest.markers.map(m=>m.id),...(quest.returnToGiver?['returned-to-giver']:[])];
  if(!Array.isArray(keys)||keys.length!==kills||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||!k||k.length>500)||
   !Array.isArray(evidence)||new Set(evidence).size!==evidence.length||evidence.some(k=>!allowed.includes(k))||!Array.isArray(q.pendingItems)||q.pendingItems.length>2)invalid();
  const pendingItems=(q.pendingItems as unknown[]).map(parseItem),submitted=['claimed','reward-pending'].includes(String(q.status));
  const complete=q.origin==='legacy-ready'||q.origin==='legacy-claimed'||kills===(hunt?.count??0)&&allowed.every(k=>(evidence as unknown[]).includes(k));
  if(submitted!==q.xpGranted||(q.status==='ready'||submitted)&&!complete||q.status==='claimed'&&pendingItems.length||q.status==='reward-pending'&&!pendingItems.length||!submitted&&pendingItems.length)invalid();
  const choice=q.rewardChoice;if(choice!==undefined&&typeof choice!=='string')invalid();
  let rewards;try{rewards=quest.rewardChoices&&!submitted?quest.rewardChoices:progressionRewardStacks(id,classId,choice as string|undefined);}catch{invalid();}
  if(pendingItems.some(i=>i.plus!==0||!rewards!.some(r=>r.id===i.id&&i.count<=r.count))||new Set(pendingItems.map(i=>i.id)).size!==pendingItems.length)invalid();
  result.quests[id as ProgressionQuestId]={status:q.status as ProgressionQuestRecord['status'],classId,acceptedAt:q.acceptedAt as number,kills,killKeys:keys as string[],evidence:evidence as string[],xpGranted:q.xpGranted as boolean,pendingItems,
   origin:q.origin as ProgressionQuestRecord['origin'],...(choice===undefined?{}:{rewardChoice:choice as string}),...(q.prerequisiteExempt===undefined?{}:{prerequisiteExempt:q.prerequisiteExempt as boolean})};
 }
 return result;
}
