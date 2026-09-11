// Scale the existing level-25 Warden baseline to level 40; keep its rig and attacks.
export const CAVE_BOSS_ID='cave_boss';
export const CAVE_BOSS_UID='wf:great_cave:cave_boss:000';
export const CAVE_BOSS_RESPAWN_MS=30*60*1000;
export const CAVE_BOSS_DEFINITION={
 visualModel:'RiftWarden',visualHeight:5.1,name:'Хранитель глубин',model:'RiftWarden',
 level:40,hp:Math.round(9000*40/25),atk:Math.round(90*40/25),xp:14400,gold:[100000,100000],
 tint:0x7bc8ed,scale:2.3,boss:'big',drops:[],
};
export const CAVE_BOSS_SLOT={
 uid:CAVE_BOSS_UID,speciesId:CAVE_BOSS_ID,locationId:'great_cave',subzoneId:'central_hall',
 groupId:'great_cave_guardian',boss:true,spaceId:'great_cave' as const,
 x:20,z:100,patrol:[],aggroRadius:13,leashRadius:26,
};
