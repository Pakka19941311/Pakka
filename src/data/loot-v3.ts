import {SKILL_BOOKS} from './skill-books.ts';
import {rollAccessoryLoot} from './accessory-loot-v3.ts';
// One equipment pool roll, separate resources and scrolls. XP rate never enters loot.
export type LootStack={id:string;count:number};
const pools:Record<string,string[]>={
 wolf:['wardens_blade','blackwood_bow','wolf_gloves','tracker_coat','fang_necklace'],
 exile:['wardens_blade','bone_fangs','militia_plate','night_leather','ash_belt'],
 spider:['ember_staff','mourn_grimoire','oracle_robe','night_leather'],
 undead:['wardens_blade','mourn_grimoire','militia_plate','bone_raiment','grave_boots','fang_necklace'],
 bat:['bone_fangs','blackwood_bow','tracker_coat','night_leather','wolf_gloves','fang_necklace'],
 cultist:['ember_staff','mourn_grimoire','oracle_robe','bone_raiment','ash_belt'],
 miner:['wardens_blade','blackwood_bow','militia_plate','fallen_helm','fallen_helm_open','grave_boots','ash_belt'],
 wraith:['mourn_grimoire','ember_staff','oracle_robe','bone_raiment','grave_boots'],
 night_zombie:['wardens_blade','bone_fangs','militia_plate','night_leather','grave_boots','fang_necklace'],
 night_skeleton:['blackwood_bow','mourn_grimoire','tracker_coat','bone_raiment','fallen_helm_open'],
 mini:['executioner','fallen_helm','fallen_helm_open','fang_necklace','wolf_gloves','ash_belt'],
 big:['rotten_root','dead_king_plate','sovereign_seal','executioner'],
};
export const GOLEM_EQUIPMENT=['rift_sword','rift_staff','rift_daggers','rift_bow','rift_grimoire','rift_plate','rift_helm','rift_gloves','rift_boots','rift_shield','rift_coat','rift_robe','shade_chest','shade_helm','shade_gloves','shade_boots','rift_belt','rift_neck_blade','rift_neck_soul','rift_ear_guard','rift_ear_soul'];
export const WARDEN_EQUIPMENT=['warden_sword','warden_staff','warden_daggers','warden_bow','warden_grimoire','warden_plate','warden_vestment','warden_shade','warden_seal'];
const firePool=GOLEM_EQUIPMENT.filter(id=>!['rift_boots','rift_robe','shade_helm','shade_boots','rift_neck_soul','rift_ear_soul'].includes(id));
const icePool=GOLEM_EQUIPMENT.filter(id=>!['rift_plate','rift_gloves','rift_shield','rift_coat','shade_chest','shade_gloves','rift_neck_blade','rift_ear_guard'].includes(id));
export function rollLootV3(id:string,random:()=>number):LootStack[]{
 const loot:LootStack[]=[];
 const add=(id:string,count=1)=>{const old=loot.find(i=>i.id===id);if(old)old.count+=count;else loot.push({id,count});};
 const roll=(id:string,chance:number,count=1)=>{if(random()<chance)add(id,count);};
 const pick=(pool:string[],count:number)=>{const remaining=[...pool];for(let i=0;i<count&&remaining.length;i++)add(remaining.splice(Math.min(remaining.length-1,Math.floor(random()*remaining.length)),1)[0]);};
 if(id==='cave_boss'){
   for(let i=0;i<3;i++)add(random()<.5?'weapon_scroll':'armor_scroll');
   for(let i=0;i<3;i++)add(random()<.5?'weapon_scroll_improved':'armor_scroll_improved');
   pick(WARDEN_EQUIPMENT.slice(0,5),1);
   if(random()<.2)pick(Object.values(SKILL_BOOKS).filter(b=>b.level>=60).map(b=>b.id),1);
   return loot;
 }
 const golem=id==='fire_golem'||id==='ice_golem',boss=['mini','big','rift_boss'].includes(id);
 if(id==='rift_boss'){pick(WARDEN_EQUIPMENT.slice(0,5),1);pick(WARDEN_EQUIPMENT.slice(5),1);pick(GOLEM_EQUIPMENT,1);add('ancient_shard',2+Math.floor(random()*3));add('fire_core',3+Math.floor(random()*3));add('ice_core',3+Math.floor(random()*3));roll('haste',.5);}
 else if(id==='big'){pick(pools.big,2+(random()<.3?1:0));add('boss_seal');add('black_bone',4+Math.floor(random()*3));add('iron',2);}
 else if(id==='mini'){pick(pools.mini,1+(random()<.35?1:0));add('wolf_fang',3+Math.floor(random()*3));roll('iron',.5,1+Math.floor(random()*2));}
 else if(golem){pick(id==='fire_golem'?firePool:icePool,(random()<.5?1:0)+(random()<.1?1:0));add(id==='fire_golem'?'fire_core':'ice_core',1+Math.floor(random()*2));roll('ancient_shard',.15);roll(id==='fire_golem'?'iron':'black_bone',.5,1+Math.floor(random()*2));}
 else {
   const tier=['wolf','exile','spider'].includes(id)?.25:['undead','bat','night_zombie','night_skeleton'].includes(id)?.30:.35;
   if(pools[id]&&random()<tier)pick(pools[id],1);
   const resources:Record<string,string[]>={wolf:['wolf_fang','black_bone'],exile:['iron','black_bone'],spider:['venom','black_bone'],undead:['black_bone','iron'],bat:['wolf_fang','venom'],cultist:['black_bone','venom'],miner:['iron','black_bone'],wraith:['black_bone','venom']};
   const [main,extra]=resources[id]??['black_bone','iron'];roll(main,.85,1+Math.floor(random()*2));roll(extra,.25);
 }
 if(boss){add('potion',id==='rift_boss'?3:2);add('ether',id==='rift_boss'?3:2);}else{roll('potion',golem?.30:.25);roll('ether',golem?.25:.20);roll('haste',golem?.05:.03);roll('teleport',golem?.03:.02);}
 if(id==='rift_boss'){add('weapon_scroll');add('armor_scroll');const weapon=random()<.5;add(weapon?'weapon_scroll_improved':'armor_scroll_improved');roll(weapon?'armor_scroll_improved':'weapon_scroll_improved',.25);}
 else if(id==='big'){roll('weapon_scroll',.5);roll('armor_scroll',.5);add(random()<.5?'weapon_scroll_improved':'armor_scroll_improved');}
 else{const high=['cultist','miner','wraith'].includes(id),low=['wolf','exile','spider'].includes(id);const normal=id==='mini'?.35:golem?.10:high?.05:low?.03:.04,improved=id==='mini'?.05:golem?.02:high?.008:low?.003:.005;
   for(const kind of ['weapon','armor']){const value=random();if(value<improved)add(kind+'_scroll_improved');else if(value<improved+normal)add(kind+'_scroll');}}
 for(const item of rollAccessoryLoot(id,random))add(item.id,item.count);
 return loot;
}
