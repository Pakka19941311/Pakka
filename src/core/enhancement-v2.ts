import type { ItemReference } from './inventory-commands.ts';
export type EnhancementCategory = 'weapon' | 'armor';
export type ScrollQuality = 'normal' | 'improved';
export const SCROLLS: Record<string,{category: EnhancementCategory; quality: ScrollQuality}> = {
  weapon_scroll: {category:'weapon',quality:'normal'}, weapon_scroll_improved:{category:'weapon',quality:'improved'},
  armor_scroll:{category:'armor',quality:'normal'}, armor_scroll_improved:{category:'armor',quality:'improved'},
};
export const ENHANCEMENT_PERCENT = {
 weapon_normal:[100,100,100,50,38,29,22,17,13,10,8,6,5,4,3],
 weapon_improved:[100,100,100,75,56,41,31,23,17,14,11,9,8,6,5],
 armor_normal:[100,65,50,40,30,22,15,9,5,2,1,.5,.2,.1,.05],
 armor_improved:[100,100,70,58,46,34,24,15,9,4,2,1,.5,.25,.1],
} as const;
export function enhancementCategory(slot?: string): EnhancementCategory | null {
 if(slot==='weapon')return 'weapon';
 return slot && ['head','chest','gloves','boots','belt','neck','ring','ring1','ring2','ear','earring','ear1','ear2','offhand'].includes(slot) ? 'armor' : null;
}
export function scrollChance(scrollId: string, slot: string|undefined, current: number): number {
 const scroll=SCROLLS[scrollId];
 if(!scroll || enhancementCategory(slot)!==scroll.category || !Number.isInteger(current) || current<0 || current>=15)return 0;
 return ENHANCEMENT_PERCENT[`${scroll.category}_${scroll.quality}`][current]/100;
}
export type EnhancementItem = {-readonly [K in keyof ItemReference]: ItemReference[K]};
export type EnhancementPlayer<T extends EnhancementItem> = {dead:boolean;inventory:T[];equipment:Record<string,T|undefined>};
export type EnhancementRef = ItemReference & {location:'bag'|'equipment';slot?:string};
const same=(a:ItemReference|undefined,b:ItemReference)=>!!a&&a.uid===b.uid&&a.id===b.id&&a.plus===b.plus&&a.count===b.count;
export function enhanceItem<T extends EnhancementItem>(player:EnhancementPlayer<T>, scroll:ItemReference, target:EnhancementRef, definition:(item:T)=>{slot?:string}, roll:number) {
 if(player.dead)return {ok:false as const,reason:'Персонаж погиб.'};
 const all=[...player.inventory,...Object.values(player.equipment).filter((i):i is T=>!!i)];
 if(new Set(all.map(i=>i.uid)).size!==all.length)return {ok:false as const,reason:'Нарушена уникальность предметов.'};
 const source=player.inventory.find(i=>i.uid===scroll.uid);
 const item=target.location==='bag'?player.inventory.find(i=>i.uid===target.uid):player.equipment[target.slot??''];
 if(!same(source,scroll)||!same(item,target)||!source||!item||source.count<1||item.count!==1||source.uid===item.uid)return {ok:false as const,reason:'Предмет или свиток изменился. Выберите заново.'};
 const chance=scrollChance(source.id,definition(item).slot,item.plus);
 if(!chance)return {ok:false as const,reason:item.plus>=15?'Достигнут предел +15.':'Свиток не подходит к предмету.'};
 if(!Number.isFinite(roll)||roll<0||roll>=1)return {ok:false as const,reason:'Некорректный случайный исход.'};
 const success=roll<chance;
 const inventory=player.inventory.map(i=>({...i}));const equipment=Object.fromEntries(Object.entries(player.equipment).map(([k,v])=>[k,v?{...v}:undefined])) as Record<string,T|undefined>;
 const scrollIndex=inventory.findIndex(i=>i.uid===source.uid);inventory[scrollIndex].count--;if(!inventory[scrollIndex].count)inventory.splice(scrollIndex,1);
 if(target.location==='bag') {const index=inventory.findIndex(i=>i.uid===item.uid);if(success)inventory[index].plus++;else inventory.splice(index,1);}
 else if(success)equipment[target.slot!]!.plus++;else delete equipment[target.slot!];
 return {ok:true as const,inventory,equipment,success,chance,from:item.plus,to:success?item.plus+1:null,itemUid:item.uid};
}
export const SCROLL_DROP_TABLE: Record<string,Partial<Record<EnhancementCategory,readonly [number,number]>>> = {
 exile:{weapon:[.02,.002]},undead:{armor:[.02,.002]},cultist:{weapon:[.04,.004]},miner:{armor:[.04,.004]},wraith:{armor:[.04,.004]},mini:{weapon:[.2,.02],armor:[.2,.02]},big:{weapon:[.4,.04],armor:[.4,.04]},
};
export function rollScrollDrops(monsterId:string, random:()=>number=Math.random):string[] {
 const result:string[]=[];
 for(const [category,rates] of Object.entries(SCROLL_DROP_TABLE[monsterId]??{})) {
  const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('Invalid drop roll');
  const [normal,improved]=rates!;
  if(roll<improved)result.push(`${category}_scroll_improved`);else if(roll<improved+normal)result.push(`${category}_scroll`);
 }
 return result;
}
export function migrateScrollSave<T extends {schema?:number;player:{inventory:EnhancementItem[]};lootBuffer?:EnhancementItem[];legacyScrolls?:number}>(save:T):T & {schema:number;legacyScrolls:number} {
 if((save.schema??1)>2)throw Error('Сохранение из более новой версии.');
 if(!save.player || !Array.isArray(save.player.inventory))throw Error('Повреждённое сохранение: инвентарь');
 const next=structuredClone(save);let reserve=next.legacyScrolls??0;
 if(!Number.isSafeInteger(reserve)||reserve<0)throw Error('Повреждённый запас свитков');
 const migrate=(items:EnhancementItem[])=>items.filter(item=>{
  if(item.id!=='scroll')return true;
  if(!Number.isSafeInteger(item.count)||item.count<1)throw Error('Повреждённый старый свиток');
  reserve+=item.count;return false;
 });
 next.player.inventory=migrate(next.player.inventory);if(next.lootBuffer)next.lootBuffer=migrate(next.lootBuffer);
 if(!Number.isSafeInteger(reserve))throw Error('Переполнение старого запаса');
 return {...next,schema:2,legacyScrolls:reserve};
}
export function exchangeLegacyScroll<T extends EnhancementItem>(inventory:T[],reserve:number,category:EnhancementCategory,make:(id:string)=>T) {
 if(!Number.isSafeInteger(reserve)||reserve<1)return {ok:false as const,reason:'Старых свитков нет.'};
 const id=`${category}_scroll`;if(!SCROLLS[id])return {ok:false as const,reason:'Неизвестная категория.'};
 const next=inventory.map(i=>({...i}));const stack=next.find(i=>i.id===id);
 if(stack)stack.count++;else {if(next.length>=42)return {ok:false as const,reason:'Освободите ячейку в сумке.'};next.push(make(id));}
 return {ok:true as const,inventory:next,legacyScrolls:reserve-1};
}
