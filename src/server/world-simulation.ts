import {CAVE_BOSS_ID,CAVE_BOSS_UID,CAVE_BOSS_RESPAWN_MS} from '../data/cave-boss.ts';
import { worldCycleAt, rollNightDrops, PHASE_MS, HASTE_DURATION_MS, STORAGE_CAPACITY } from '../world/world-cycle.ts';
import {rollLootV3} from '../data/loot-v3.ts';
import {RING_RECIPES,ACCESSORY_MIGRATION_VERSION,itemSellPrice} from '../data/accessories-v3.ts';
import {craftRing} from '../core/ring-crafting.ts';
import {migrateAccessories,claimMigrationItem} from '../core/accessory-migration.ts';
import type {AccessoryBackup} from '../core/accessory-migration.ts';
import {SKILL_BOOKS} from '../data/skill-books.ts';
import {BookSystem} from './book-system.ts';
import type {BookArea,BookTrap} from './book-system.ts';
import { CLASSES, ITEMS, MONSTERS } from '../data/game-data.ts';
import { calculateEquipmentStats } from '../core/equipment-stats.ts';
import type { ItemStatDefinition } from '../core/equipment-stats.ts';
import { grantBetaScrolls } from '../core/beta-scrolls.ts';
import { enhanceItem, rollScrollDrops } from '../core/enhancement-v2.ts';
import { equipInventoryItem, unequipInventoryItem, reorderInventoryItem } from '../core/inventory-commands.ts';
import {transferStorage} from '../core/storage-transfers.ts';
import type { InventoryItem } from '../core/inventory-commands.ts';
import { addOrStackItem, applyExperience } from '../core/gameplay-session.ts';
import { bossRespawnSeconds, classAttackRange, classCombatProfile, monsterMovementSpeed, attackDamageType, accuracyForDamage, manaRegenerationPerSecond } from '../core/game-rules.ts';
import { resolveAttackAccuracy } from '../core/attack-accuracy.ts';
import { CollisionWorld } from '../world/collision-world.ts';
import { SPAWN_REGIONS, spawnPointInRegion, patrolRouteInRegion } from '../world/spawn-regions.ts';
import { CONTENT_VERSION, mapVersion } from './content-manifest.ts';
import { findNavigationPath } from '../world/navigation.ts';
import { TerrainSurface } from '../world/terrain-surface.ts';
import type {FinalWorld, TerrainSupport} from '../world/final-world.ts';
import {inPolygon} from '../world/final-world.ts';
import {sameSpace,spaceOf} from '../world/world-space.ts';
import { START_POINT, SERVICES, FORT, CAPITAL, isTerritorySafe, TERRITORY_VERSION } from '../world/territory.ts';
import { migrateTerritory, legacyTerritoryPosition } from '../world/territory-migration.ts';
import { CharacterMotor, smoothAngle } from '../controls/character-motor.ts';
import { slidePastActor } from '../controls/actor-spacing.ts';
import { resolveChainLightning } from '../combat/chain-lightning.ts';
import { combatSpacing, approachPoint, facingTarget, attackTimings } from '../combat/combat-approach.ts';
import { MonsterAiBrain } from '../world/monster-ai.ts';
import { WORLD_PROTOCOL, DISCONNECT_GRACE_MS } from '../network/world-protocol.ts';
import { parseBetaSave } from './beta-import.ts';
import type { WorldCharacter, WorldMonster, WorldSummon, WorldCommand, WorldIntent, WorldEvent, WorldSnapshot, CommandReceipt, Position, WorldMotion, TradeSession } from '../network/world-protocol.ts';

type ClassId = keyof typeof CLASSES;
type ItemId = keyof typeof ITEMS;
type MonsterId = keyof typeof MONSTERS;
type Skill = { cost: number; cd: number; mul?: number; fx: string; buff?: string; summon?: boolean; chain?: number; chainRadius?: number; chainFalloff?: number; aoe?: number; stun?: number; slow?: number; dot?: number; knock?: number; leech?: number };
type PendingAttack = {
  slam?:Position;actor:string; target:string; generation:number; actorGeneration?:number;
  hitAt:number; endsAt?:number; skill:number|null; monster:boolean; summon?:boolean; owner?:string; released?:boolean;
  damage?:number; critical?:boolean; accuracy?:number; resourcePaid?:boolean;
};
type Projectile = {actor:string;target:string;generation:number;actorGeneration:number;skill:number|null;damage:number;critical:boolean;accuracy:number;startedAt:number;endsAt:number;origin:Position & {y:number};point:Position & {y:number}};
const motion=(now:number):WorldMotion=>({yOffset:0,grounded:true,yaw:0,action:'idle',actionStartedAt:now,actionEndsAt:0,velocityX:0,velocityZ:0,verticalVelocity:0,locomotionState:'ground',combatState:'idle',hitAt:0,hitUntil:0});
export type PersistedWorld = {
  accessoryMigrationBackups?:Record<string,{at:number;version:number;items:AccessoryBackup}>;
  mapVersion?:string; territoryVersion?:number; finalWorldRevision?:string;
  previousWorld?:{mapVersion?:string;monsters:WorldMonster[]};
  coordinateMigrations?:Array<{at:number;from:string;to:string;positions:Array<{id:string;kind:string;from:Position;to:Position;oldHome?:Position}>}>;
  cycleEpoch?:number; nightSpawned?:number; chat?:import('../network/world-protocol.ts').WorldChatMessage[]; chatSequence?:number;
  schema: 1; time: number; revision: number; sequence: number;
  characters: Record<string, WorldCharacter>; monsters: WorldMonster[]; summons: WorldSummon[];
  bookAreas?:BookArea[];bookTraps?:BookTrap[];
  pending: PendingAttack[]; projectiles?:Projectile[];
};
export interface SimulationStore {
  load(): PersistedWorld | null;
  save(state: PersistedWorld): void;
  receipt(character: string, id: string, payload: WorldCommand): CommandReceipt | null;
  commit(state: PersistedWorld, character: string, id: string, payload: WorldCommand, result: CommandReceipt): void;
  imported(id: string, original: unknown): string | null;
  commitImport(state: PersistedWorld, character: string, id: string, original: unknown, at: number): void;
}
export const WORLD_PHYSICS_HZ = 60;
const STEP_MS = 1000 / WORLD_PHYSICS_HZ;
const REFERENCE_DEATH_MS = 420;
const REFERENCE_CORPSE_MS = 2580;
const SPAWN = START_POINT;
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
const SELLER_IDS = new Set(['npc:smith','npc:asterhold:smith','npc:alchemist','npc:asterhold:alchemist']);

const itemDef = (item: InventoryItem): ItemStatDefinition & {slot?:string} => ITEMS[item.id as ItemId] as ItemStatDefinition & {slot?:string};
const monsterDef = (m: WorldMonster) => MONSTERS[m.id as MonsterId];

const teleportPoints: Record<string, {x:number;z:number;cost:number;level:number}> = {
  // Arrival courtyard, south of the keep and inside the open gate.
  'Астерхолд': {x:-98,z:-84,cost:0,level:1}, 'Гринфолл': {...SPAWN,cost:25,level:1},
  'Чёрный лес': {x:74,z:34,cost:90,level:10}, 'Вход в шахту': {x:-46,z:90,cost:150,level:10},
};

/** No DOM, engine, frame rate, client clock or rendering visibility is consulted here. */
export class WorldSimulation {
  state: PersistedWorld;
  readonly events: WorldEvent[] = [];
  private readonly random: () => number;
  private readonly identifier: () => string;
  private readonly store: SimulationStore;
  private readonly collision: CollisionWorld;
  private readonly beta: boolean;
  private readonly xpRate:number;
  private readonly books:BookSystem;
  private applyingCommand=false;
  private readonly terrain: TerrainSupport;
  readonly finalWorld?:FinalWorld;
  private activeMonsters:WorldMonster[]=[];
  private safe=(p:Position)=>this.finalWorld?this.finalWorld.safe(p):isTerritorySafe(p);
  private nearService=(p:Position,kind:string)=>Object.entries(this.finalWorld?.services??SERVICES).some(([id,point])=>id.split(':').at(-1)===kind&&sameSpace(p,point)&&distance(p,point)<=3.2);
  private collisionFor(p:Position):CollisionWorld{return this.finalWorld?.space(p).collision??this.collision;}
  private terrainFor(p:Position):TerrainSupport{return this.finalWorld?.space(p).terrain??this.terrain;}
  private startPoint():Position{return this.finalWorld?.start??SPAWN;}
  private boundsFor(p:Position):number[]{return this.finalWorld?.space(p).bounds??[-156,-136,156,136];}
  private readonly mapContentVersion: string;
  private lastCheckpoint: number;
  private physicsEpoch: number;
  private physicsTick = 0;
  private nextEnvironmentCheck=0;
  private paths = new Map<string, { goal: Position; points: Position[]; expiresAt: number }>();
  private brains = new Map<string,MonsterAiBrain>();
  private motors=new Map<string,CharacterMotor>();
  private approaching=new Set<string>();
  private firingPositions=new Map<string,{target:string;origin:Position;goal:Position;expiresAt:number}>();
  private patrols=new Map<string,Position[]>();
  private pursuit=new Map<string,{x:number;z:number;since:number}>();
  // Runtime capability only: never restored from saves or command receipts.
  private tradeSessions=new Map<string,TradeSession>();

  private tradeService(p:WorldCharacter,npcId:string):void {
    const npc=(this.finalWorld?.services??SERVICES)[npcId as keyof typeof SERVICES];
    if(!SELLER_IDS.has(npcId)||!npc||!('merchantRole' in npc)||!['weapon_vendor','alchemist'].includes(npc.merchantRole))throw Error('merchant-unavailable');
    if(p.dead||p.hp<=0)throw Error('dead');
    if(p.activeUntil<=this.state.time)throw Error('trade-session-required');
    const inCity=(point:Position)=>{
      if(spaceOf(point)!=='surface')return false;
      if(this.finalWorld){
        const city=this.finalWorld.layout.locations.find((l:{id:string})=>l.id===npc.tradeCity);
        return Boolean(city?.safe&&city.space_id==='surface'&&Array.isArray(city.outline_xz)&&inPolygon(point.x,-point.z,city.outline_xz));
      }
      const city=npc.tradeCity==='L02'?FORT:npc.tradeCity==='L01'?CAPITAL:undefined;
      return Boolean(city&&Math.abs(point.x-city.x)<city.width/2&&Math.abs(point.z-city.z)<city.depth/2);
    };
    if(!sameSpace(p,npc)||!inCity(p)||!inCity(npc))throw Error('merchant-unavailable');
    const terrain=this.terrainFor(p),dy=terrain.supportAt(p.x,p.z)+p.yOffset-terrain.supportAt(npc.x,npc.z);
    if(!Number.isFinite(dy)||Math.hypot(p.x-npc.x,p.z-npc.z,dy)>3.2)throw Error('merchant-out-of-range');
    if(!this.lineOfSight(p,npc))throw Error('merchant-occluded');
  }
  private pruneTradeSession(p:WorldCharacter):void {
    const session=this.tradeSessions.get(p.id);if(!session)return;
    if(session.spaceId!==spaceOf(p)||session.generation!==p.generation){this.tradeSessions.delete(p.id);return;}
    try{this.tradeService(p,session.npcId);}catch{this.tradeSessions.delete(p.id);}
  }

  constructor(options: {store: SimulationStore; collision: CollisionWorld; terrain?: TerrainSupport; finalWorld?:FinalWorld; now: number; random?: () => number; identifier: () => string; beta?: boolean; xpRate?:number}) {
    this.finalWorld=options.finalWorld;
    this.xpRate=options.xpRate??1;if(!Number.isFinite(this.xpRate)||this.xpRate<1||this.xpRate>100)throw Error('invalid-xp-rate');
    this.books=new BookSystem({now:()=>this.state.time,heroes:()=>Object.values(this.state.characters),monsters:()=>this.state.monsters,summons:()=>this.state.summons,areas:()=>this.state.bookAreas??=[],traps:()=>this.state.bookTraps??=[],random:()=>this.random(),uid:()=>this.identifier(),hp:m=>monsterDef(m).hp,safe:this.safe,visible:(a,b)=>this.lineOfSight(a,b),damage:(m,n,p,c)=>this.damage(m,n,p,c),recalculate:p=>this.recalculate(p),event:(k,a,t,e)=>this.event(k,a,t,e),provoke:(m,p)=>this.provoke(m,p),release:m=>{this.cancelAttack(m.uid);m.provokedBy=undefined;m.targetId=null;m.returnFromTaunt=true;this.brains.delete(m.uid);},cancel:id=>this.cancelAttack(id),summonPoint:p=>({...this.collisionFor(p).findNearestFree({x:p.x+1,z:p.z},.46),spaceId:p.spaceId})});
    this.store = options.store; this.collision = options.collision;
    this.terrain = options.terrain ?? new TerrainSurface();
    this.mapContentVersion=this.finalWorld?.mapVersion??mapVersion(this.collision,this.terrain);
    this.random = options.random ?? Math.random; this.identifier = options.identifier; this.beta = Boolean(options.beta);
    const loaded=this.store.load();
    this.state = loaded ?? {schema:1,mapVersion:this.mapContentVersion,territoryVersion:TERRITORY_VERSION,time:options.now,revision:0,sequence:0,characters:{},monsters:[],summons:[],pending:[]};
    if (this.state.schema !== 1) throw Error('unsupported-world-schema');
    // The cave timer advances only while the game process runs. Other existing
    // clocks retain their own lifecycle; a restart preserves this remaining delay.
    if(loaded)for(const m of this.state.monsters)if(m.uid===CAVE_BOSS_UID&&!m.alive)
      m.respawnAt+=Math.max(0,options.now-this.state.time);
    if(this.finalWorld)this.migrateFinalWorld();
    else if(loaded)migrateTerritory(this.state,this.collision,this.mapContentVersion);
    this.state.projectiles??=[];
    this.state.cycleEpoch??=this.state.time-PHASE_MS/4;this.state.chat??=[];this.state.chatSequence??=0;
    for(const actor of [...Object.values(this.state.characters),...this.state.monsters,...this.state.summons])Object.assign(actor,{...motion(this.state.time),...actor});
    this.lastCheckpoint = this.state.time;
    this.physicsEpoch = this.state.time;
    if(this.finalWorld){
      const existing=new Set(this.state.monsters.map(m=>m.uid));
      for(const slot of this.finalWorld.slots)if(!existing.has(slot.uid))this.spawnMonster(slot.speciesId,slot,slot.uid,slot.groupId);
    }else for(const region of SPAWN_REGIONS)for(let i=0;i<region.population;i++)if(!this.state.monsters.some(m=>m.uid===`${region.id}:${i}`))this.spawnMonster(region.monsterId,spawnPointInRegion(region,i),`${region.id}:${i}`,region.id,i);
    // A process restart breaks all connections. Never renew their exposure deadline.
    for (const p of Object.values(this.state.characters)) {
      p.storage??=[];p.buffs.haste??=0;this.migrateAccessories(p);this.migrateEquipment(p);this.recalculate(p);
      p.activeUntil = Math.min(p.activeUntil, this.state.time + DISCONNECT_GRACE_MS);
      p.direction = {x:0,z:0};p.destination=null;p.target=null;p.skill=null;p.bufferedSkill=undefined;p.autoAttack=false;p.singleAttack=false;
      Object.assign(p,{...motion(this.state.time),yaw:p.yaw,action:p.dead?'death':'idle',combatState:p.dead?'dead':'idle'});
    }
    // Process restarts cancel unfinished windups; already released projectiles
    // remain server-owned and retain their generation checks.
    this.state.pending=this.state.pending.filter(a=>a.monster&&a.actor!==CAVE_BOSS_UID);
    this.advance(options.now);
    this.store.save(this.state);
  }


  private migrateFinalWorld():void {
    const world=this.finalWorld!;
    if(this.state.finalWorldRevision!==world.revision){
      this.state.previousWorld??={mapVersion:this.state.mapVersion,monsters:structuredClone(this.state.monsters)};
      this.state.coordinateMigrations??=[];
      const positions=Object.values(this.state.characters).map(p=>({id:p.id,kind:'character',from:{x:p.x,z:p.z},to:{...world.start}}));
      this.state.coordinateMigrations.push({at:this.state.time,from:this.state.mapVersion??'legacy',to:world.mapVersion,positions});
      for(const p of Object.values(this.state.characters))Object.assign(p,world.start,{generation:p.generation+1});
      this.state.monsters=[];this.state.summons=[];this.state.pending=[];this.state.projectiles=[];this.state.bookAreas=[];this.state.bookTraps=[];
      this.state.finalWorldRevision=world.revision;
    }
    for(const p of Object.values(this.state.characters)){
      if(!world.spaces[spaceOf(p)])throw Error('unknown-saved-space');
      if(world.space(p).collision.isBlocked(p,.46)){
        const q=world.space(p).collision.findNearestFree(p,.46);
        Object.assign(p,world.space(p).collision.isBlocked(q,.46)?world.start:q,{generation:p.generation+1});
      }
    }
    this.state.mapVersion=world.mapVersion;
  }

  createCharacter(name: string, classId: string): WorldCharacter {
    const p=this.prepareCharacter(name,classId);
    this.state.characters[p.id] = p;
    try { this.store.save(this.state); } catch (error) { delete this.state.characters[p.id]; throw error; }
    return p;
  }

  importCharacter(importId: string, raw: unknown): WorldCharacter {
    if (!this.beta) throw Error('beta-import-disabled');
    if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(importId)) throw Error('invalid-import-id');
    const existing=this.store.imported(importId,raw);
    if (existing) return this.character(existing);
    const imported=parseBetaSave(raw);
    let p:WorldCharacter={...this.prepareCharacter(imported.name,imported.classId),...imported};
    // Old client UIDs are not world-global identities. The exact original is
    // retained in the same durable transaction as the remapped character.
    const remap=(item:InventoryItem)=>({...item,uid:this.identifier()});
    p.inventory=p.inventory.map(remap);p.lootBuffer=p.lootBuffer.map(remap);
    p.storage=p.storage?.map(item=>item?remap(item):null);p.migrationReserve=p.migrationReserve?.map(remap);p.accessoryMigrationVersion=undefined;
    p.equipment=Object.fromEntries(Object.entries(p.equipment).map(([slot,item])=>[slot,item?remap(item):undefined]));
    const granted=grantBetaScrolls({player:p,lootBuffer:p.lootBuffer,betaScrollGrant:p.betaScrollGrant},id=>this.item(id));
    p={...granted.player,lootBuffer:granted.lootBuffer,betaScrollGrant:granted.betaScrollGrant};
    this.migrateAccessories(p);this.migrateEquipment(p);this.recalculate(p);if(p.dead){p.hp=0;p.action='death';}
    const oldPosition={x:p.x,z:p.z};
    if(this.finalWorld)p.spaceId='surface';
    Object.assign(p,this.collision.findNearestFree(this.finalWorld?this.finalWorld.start:legacyTerritoryPosition(p),.46));
    this.state.coordinateMigrations??=[];
    this.state.coordinateMigrations.push({at:this.state.time,from:'browser-import',to:this.mapContentVersion,positions:[{id:p.id,kind:'character',from:oldPosition,to:{x:p.x,z:p.z}}]});
    this.state.characters[p.id]=p;
    try { this.store.commitImport(this.state,p.id,importId,raw,this.state.time); }
    catch(error){delete this.state.characters[p.id];throw error;}
    return p;
  }

  private prepareCharacter(name: string, classId: string): WorldCharacter {
    if (!Object.hasOwn(CLASSES,classId) || typeof name !== 'string') throw Error('invalid-character');
    const cls = CLASSES[classId as ClassId];
    const starterGear = {weapon:this.item(cls.weapon),chest:this.item(cls.armor)};
    // Only new knights begin in their base clothing. Keep the original items
    // in their bag; persisted/imported equipment is never migrated or stripped.
    const equipment: Record<string,InventoryItem|undefined> = classId==='knight'?{}:starterGear;
    const calculated = calculateEquipmentStats(classId,cls.stats,1,equipment,itemDef);
    let p: WorldCharacter = {
      ...this.startPoint(), ...calculated, ...motion(this.state.time), id:this.identifier(),name:name.trim().slice(0,24)||'Странник',classId,
      level:1,xp:0,gold:320,hp:calculated.maxHp,mp:calculated.maxMp,
      inventory:[this.item('potion',6),this.item('ether',4),this.item('teleport'),...(classId==='knight'?Object.values(starterGear):[])],equipment,
      storage:[],lootBuffer:[],migrationReserve:[],accessoryMigrationVersion:ACCESSORY_MIGRATION_VERSION,quest:0,kills:0,bossKills:0,dead:false,cooldowns:[0,0,0,0],attackReadyAt:0,
      buffs:{guard:0,vanish:0,haste:0},activeUntil:0,lastInputSequence:-1,lastInputAt:0,
      direction:{x:0,z:0},destination:null,target:null,skill:null,generation:1,
    };
    if (this.beta) {
      // This preview kit belongs only to a freshly created beta knight. It
      // enables real inventory review without changing live loot or old saves.
      if(classId==='knight')p.inventory.push(...['fallen_helm','fallen_helm_open','wolf_gloves','grave_boots','ash_belt'].map(id=>this.item(id)));
      const granted = grantBetaScrolls({player:p,lootBuffer:p.lootBuffer,betaScrollGrant:p.betaScrollGrant}, id=>this.item(id));
      p = {...granted.player,lootBuffer:granted.lootBuffer,betaScrollGrant:granted.betaScrollGrant};
    }
    return p;
  }

  heartbeat(id: string): void {
    const p=this.character(id);
    if(p.activeUntil<=this.state.time)this.tradeSessions.delete(id);
    p.activeUntil=this.state.time+DISCONNECT_GRACE_MS;
  }
  disconnect(id: string): void {
    const p = this.character(id);
    this.tradeSessions.delete(id);
    p.activeUntil = Math.min(p.activeUntil,this.state.time + DISCONNECT_GRACE_MS);
    p.direction = {x:0,z:0}; p.destination=null;
    this.store.save(this.state);
  }
  input(id: string, sequence: number, intent: WorldIntent): void {
    const p=this.character(id);
    if(!intent||typeof intent!=='object'||!['direction','destination','attack','jump','cancel'].includes(intent.type))throw Error('invalid-intent');
    if (!Number.isSafeInteger(sequence) || sequence <= p.lastInputSequence || p.dead) return;
    if (intent.type==='direction' || intent.type==='destination') {
      if (![intent.x,intent.z].every(Number.isFinite)) throw Error('invalid-position');
      if (intent.type==='destination' && (intent.x<this.boundsFor(p)[0]||intent.x>this.boundsFor(p)[2]||intent.z<this.boundsFor(p)[1]||intent.z>this.boundsFor(p)[3])) throw Error('outside-world');
    }
    if(intent.type==='attack'&&intent.mode!==undefined&&!['single','auto'].includes(intent.mode))throw Error('invalid-attack-mode');
    p.lastInputSequence=sequence;p.lastInputAt=this.state.time;
    if(intent.type==='jump'){
      if(this.motor(p).requestJump()){const direction=p.direction;this.cancelControl(p,false,true);p.direction=direction;p.grounded=false;p.verticalVelocity=8.2;p.locomotionState='jump_start';this.action(p,'jump');}return;
    }
    if(intent.type==='direction'){
      const length=Math.max(1,Math.hypot(intent.x,intent.z));
      if(Math.hypot(intent.x,intent.z)>.01)this.cancelControl(p,false,true);
      p.direction={x:intent.x/length,z:intent.z/length};return;
    }
    if(intent.type==='destination'){
      this.cancelControl(p,false,true);p.destination={...this.collisionFor(p).findNearestFree({x:intent.x,z:intent.z},.46),spaceId:p.spaceId};return;
    }
    if(intent.type==='cancel'){this.cancelControl(p,true,Boolean(intent.preserveAuto));return;}
    if(intent.skill!==null)throw Error('book-required');
    if(intent.skill!==null&&(!Number.isInteger(intent.skill)||intent.skill<0||intent.skill>3))throw Error('invalid-skill');
    const skill=intent.skill===null?undefined:CLASSES[p.classId as ClassId].skills[intent.skill] as Skill;
    const self=Boolean(skill?.buff||skill?.summon);
    const target=self?undefined:this.state.monsters.find(m=>m.uid===intent.entityId&&m.alive&&sameSpace(p,m));
    if(!self&&!target)throw Error('missing-target');
    if(target&&!this.lineOfSight(p,target))throw Error('target-occluded');
    if(skill&&(!p.grounded||p.mp<skill.cost))throw Error(!p.grounded?'airborne':'insufficient-resource');
    const active=this.state.pending.find(a=>a.actor===p.id);
    if(skill&&p.cooldowns[intent.skill!]>this.state.time)throw Error('skill-cooldown');
    if(active&&skill)this.cancelAttack(p.id);
    if(self){this.selfSkill(p,intent.skill!,skill!);return;}
    if(active&&p.target!==target!.uid)this.cancelAttack(p.id);
    p.target=target!.uid;p.skill=intent.skill;p.destination=null;p.direction={x:0,z:0};p.bufferedSkill=undefined;
    if(intent.skill===null){p.autoAttack=intent.mode==='auto';p.singleAttack=!p.autoAttack;}
    if(skill&&distance(p,target!)<=this.books.range(p)){p.yaw=Math.atan2(target!.x-p.x,target!.z-p.z);this.beginPlayerAttack(p,target!);}
    this.approaching.delete(p.id);this.pursuit.delete(p.id);
  }

  command(id: string, commandId: string, command: WorldCommand): CommandReceipt {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandId)) throw Error('invalid-command-id');
    this.pruneTradeSession(this.character(id));
    const previous=this.store.receipt(id,commandId,command);
    if (previous) return previous;
    const before=structuredClone(this.state);const eventsBefore=[...this.events];
    const tradeBefore=this.tradeSessions.get(id);
    let receipt: CommandReceipt;
    try {
      this.applyingCommand=true;
      const outcome=this.applyCommand(this.character(id),command);
      receipt={id:commandId,ok:true,at:this.state.time,...(outcome===undefined?{}:{outcome})};
    } catch (error) {
      if(command?.type==='tradeOpen')this.tradeSessions.delete(id);
      this.state=before;this.events.splice(0,this.events.length,...eventsBefore);this.brains.clear();this.paths.clear();
      receipt={id:commandId,ok:false,at:this.state.time,reason:error instanceof Error?error.message:'invalid-command'};
    }
    this.applyingCommand=false;
    this.state.revision++;
    try {this.store.commit(this.state,id,commandId,command,receipt);}
    catch (error) {
      this.state=before;this.events.splice(0,this.events.length,...eventsBefore);this.brains.clear();this.paths.clear();
      if(command?.type==='tradeOpen'||command?.type==='tradeClose'){
        if(tradeBefore)this.tradeSessions.set(id,tradeBefore);else this.tradeSessions.delete(id);
        this.pruneTradeSession(this.character(id));
      }
      throw error;
    }
    return receipt;
  }

  private applyCommand(p: WorldCharacter, command: WorldCommand): unknown {
    if(command.type==='tradeClose'){
      if(this.tradeSessions.get(p.id)?.token===command.token)this.tradeSessions.delete(p.id);
      return;
    }
    if(command.type==='chat'){
      if(!['world','trade'].includes(command.channel)||typeof command.text!=='string')throw Error('invalid-chat');
      const message=command.text.replace(/[\x00-\x1f\x7f]/g,' ').trim();if(!message||message.length>240)throw Error('invalid-chat');
      const last=this.state.chat!.filter(m=>m.senderId===p.id).at(-1);if(last&&this.state.time-last.at<750)throw Error('chat-too-fast');
      this.state.chat!.push({id:++this.state.chatSequence!,at:this.state.time,senderId:p.id,name:p.name,channel:command.channel,text:message});
      if(this.state.chat!.length>120)this.state.chat!.shift();return;
    }
    if (command.type==='respawn') {
      if (!p.dead) throw Error('not-dead');
      this.relocate(p,this.startPoint());Object.assign(p,{dead:false,hp:p.maxHp,mp:p.maxMp});
      return;
    }
    if (p.dead) throw Error('dead');
    if(command.type==='craftRing'){
      this.validateCraftPosition(p);
      const result=craftRing(p,command,this.random,this.identifier);p.inventory=result.inventory;p.gold=result.gold;return result.outcome;
    }
    if(command.type==='claimMigration'){
      claimMigrationItem(p,command.item,item=>Object.hasOwn(ITEMS,item.id));return {itemUid:command.item.uid};
    }
    if(command.type==='tradeOpen'){
      this.tradeService(p,command.npcId);
      const session={npcId:command.npcId,token:this.identifier(),spaceId:spaceOf(p),generation:p.generation};
      this.tradeSessions.set(p.id,session);return {...session};
    }
    if(command.type==='castBook'){this.books.cast(p,command.bookId,command.targetId,command.point?{x:command.point.x,z:command.point.z,spaceId:p.spaceId}:undefined);return;}
    if(command.type==='bookQuest'){
      const elder=(this.finalWorld?.services??SERVICES)['npc:asterhold:elder'];
      if(!sameSpace(p,elder)||distance(p,elder)>3.2)throw Error('elder-unavailable');
      if(![50,60].includes(command.level)||p.level<command.level)throw Error('book-level');
      const id=`book_${p.classId}_${command.level}`;p.bookQuests??={};
      if(p.bookQuests[id]==='claimed')throw Error('already-claimed');
      if(p.bookQuests[id]==='ready'){this.addItem(p,id);p.bookQuests[id]='claimed';}else p.bookQuests[id]='active';return;
    }
    if(command.type==='storage'){
      if(!this.nearService(p,'storage'))throw Error('storage-unavailable');
      transferStorage(p,command,item=>{const definition=itemDef(item);return Boolean(definition)&&!definition.slot&&definition.maxStack!==1&&!SKILL_BOOKS[item.id];},()=>this.identifier(),STORAGE_CAPACITY,item=>itemDef(item)?.maxStack??Number.MAX_SAFE_INTEGER);
      return;
    }
    if (command.type==='equip' || command.type==='unequip' || command.type==='reorder') {
      let result=command.type==='equip'?equipInventoryItem(p,command.item,itemDef,command.slot)
        :command.type==='unequip'?unequipInventoryItem(p,command.item,command.slot):reorderInventoryItem(p,command.item,command.index);
      if (!result.ok) throw Error(result.reason);
      if(command.type==='unequip'&&command.index!==undefined){result=reorderInventoryItem({...p,...result},command.item,command.index);if(!result.ok)throw Error(result.reason);}
      p.inventory=result.inventory;p.equipment=result.equipment;this.recalculate(p);return;
    }
    if (command.type==='enhance') {
      const slot=Object.keys(p.equipment).find(s=>p.equipment[s]?.uid===command.item.uid);
      const result=enhanceItem(p,command.scroll,{...command.item,location:slot?'equipment':'bag',slot},itemDef,this.random());
      if (!result.ok) throw Error(result.reason);
      p.inventory=result.inventory;p.equipment=result.equipment;this.recalculate(p);
      return {success:result.success,chance:result.chance,from:result.from,to:result.to,itemUid:result.itemUid};
    }
    if (command.type==='use') {
      const item=p.inventory.find(i=>i.uid===command.item.uid);
      if (!item || item.id!==command.item.id || item.plus!==command.item.plus || item.count!==command.item.count) throw Error('stale-item');
      const healing=(itemDef(item) as {heal?:number}).heal;
      if (healing) {if(p.hp>=p.maxHp)throw Error('health-full');p.hp=Math.min(p.maxHp,p.hp+healing);}
      else if(item.id==='ether' && p.mp<p.maxMp) p.mp=Math.min(p.maxMp,p.mp+Math.round(p.maxMp*.45));
      else if(item.id==='haste'){p.buffs.haste=this.state.time+HASTE_DURATION_MS;this.recalculate(p);this.event('buff',p.id);}
      else if(item.id==='teleport') this.relocate(p,this.startPoint());
      else throw Error('cannot-use');
      if (--item.count===0) p.inventory=p.inventory.filter(i=>i.uid!==item.uid);
      return;
    }
    if(command.type==='sell'){
      const session=this.tradeSessions.get(p.id);
      if(!session||!command.trade||session.token!==command.trade.token||session.npcId!==command.trade.npcId)throw Error('trade-session-required');
      this.tradeService(p,session.npcId);
      const item=p.inventory.find(i=>i.uid===command.item.uid);
      if(!item||item.id!==command.item.id||item.plus!==command.item.plus||item.count!==command.item.count)throw Error('stale-item');
      if(SKILL_BOOKS[item.id])throw Error('cannot-sell-book');
      const quantity=command.quantity??item.count;
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>item.count)throw Error('invalid-quantity');
      p.gold+=itemSellPrice(ITEMS[item.id as ItemId])*quantity;
      item.count-=quantity;if(item.count===0)p.inventory=p.inventory.filter(i=>i.uid!==item.uid);return;
    }
    if (command.type==='buy'&&SKILL_BOOKS[command.itemId]) {
      const book=SKILL_BOOKS[command.itemId];
      const services=this.finalWorld?.services??SERVICES;
      const booksellers=['npc:asterhold:shop','npc:books'].map(id=>services[id as keyof typeof services]).filter(Boolean);
      if(!booksellers.some(s=>sameSpace(p,s)&&distance(p,s)<=3.2&&this.lineOfSight(p,s))||!book.price)throw Error('shop-unavailable');
      if(book.classId!==p.classId)throw Error('class-restricted');
      if([...p.inventory,...p.lootBuffer,...(p.storage??[]).filter(Boolean)].some(i=>i?.id===book.id))throw Error('book-already-owned');
      if(p.gold<book.price)throw Error('insufficient-gold');
      if(addOrStackItem(p.inventory,this.item(book.id),false)==='full')throw Error('bag-full');
      p.gold-=book.price;return;
    }
    if (command.type==='buy') {
      if(['ring_blank','cloak_defense'].includes(command.itemId)){
        const npcId=['npc:smith','npc:asterhold:smith'].find(id=>{try{this.tradeService(p,id);return true;}catch{return false;}});
        if(!npcId)throw Error('shop-unavailable');
        const definition=ITEMS[command.itemId as 'ring_blank'|'cloak_defense'];
        if(p.gold<definition.buyPrice)throw Error('insufficient-gold');
        if(this.addInventoryItem(p,this.item(command.itemId))==='full')throw Error('bag-full');
        p.gold-=definition.buyPrice;return;
      }
      const cost: Record<string,number>={potion:55,potion_large:110,ether:70,teleport:130,haste:100};
      const atShop=this.nearService(p,'shop'),atAlchemist=command.itemId==='haste'&&this.nearService(p,'alchemist');
      if (!Object.hasOwn(cost,command.itemId) || !(atShop||atAlchemist)) throw Error('shop-unavailable');
      if (p.gold<cost[command.itemId]) throw Error('insufficient-gold');
      const item=this.item(command.itemId);
      if(addOrStackItem(p.inventory,item,!('slot' in itemDef(item)))==='full')throw Error('bag-full');
      p.gold-=cost[command.itemId];return;
    }
    if (command.type==='teleport') {
      const point=(this.finalWorld?.teleports??teleportPoints)[command.destination];
      if (!point||!this.nearService(p,'teleport')) throw Error('teleport-unavailable');
      if (p.level<point.level) throw Error('level-required');
      if (p.gold<point.cost) throw Error('insufficient-gold');
      this.relocate(p,point);p.gold-=point.cost;return;
    }
    if(command.type==='portal'){
      if(!this.finalWorld||!['mine','great_cave'].includes(command.destination))throw Error('portal-unavailable');
      const space=this.finalWorld.spaces[command.destination],def=space.definition;
      const surface={x:def.surface_portal[0],z:-def.surface_portal[2],spaceId:'surface' as const};
      const entry={x:def.entry[0],z:-def.entry[2],spaceId:space.id};
      const from=spaceOf(p)==='surface'?surface:entry;
      if(!sameSpace(p,from)||distance(p,from)>3.2||!p.grounded||!this.lineOfSight(p,from))throw Error('portal-out-of-range');
      const entering=spaceOf(p)==='surface';
      this.relocate(p,entering?{...entry,z:entry.z+4}:{...surface,z:surface.z-8});
      p.yaw=entering?0:Math.PI;return;
    }
    if (command.type==='collect') {
      const retained: InventoryItem[]=[];
      for(const item of p.lootBuffer) if(this.addInventoryItem(p,item)==='full') retained.push(item);
      p.lootBuffer=retained;return;
    }
    if (command.type==='quest') {
      if(!this.nearService(p,'elder'))throw Error('elder-unavailable');
      p.quest=Math.max(1,p.quest);
      return;
    }
    throw Error('unknown-command');
  }

  advance(now: number): void {
    if (!Number.isFinite(now)||now<this.state.time) return;
    // One fixed 60 Hz lattice matches the accepted browser simulation. HTTP
    // timing only controls how many full ticks run, never their delta.
    const maxActive=Math.max(this.state.time,...Object.values(this.state.characters).map(p=>p.activeUntil));
    const simulatedUntil=Math.min(now,Math.max(this.state.time+1000,maxActive));
    let next=this.physicsEpoch+(this.physicsTick+1)*STEP_MS;
    while(next<=simulatedUntil+1e-6){
      this.physicsTick++;this.state.time=next;this.tick(1/WORLD_PHYSICS_HZ);
      next=this.physicsEpoch+(this.physicsTick+1)*STEP_MS;
    }
    // Preserve the existing bounded offline catch-up. A sub-tick remainder is
    // not an offline jump and must never run a shorter physics step.
    if(now>simulatedUntil+1e-6){
      this.state.time=now;this.physicsEpoch=now;this.physicsTick=0;this.expireDeadlines();
    }
    this.state.revision++;
    if(now-this.lastCheckpoint>=1000){this.store.save(this.state);this.lastCheckpoint=now;}
  }
  private tickDeadline(delayMs:number):number {
    return this.physicsEpoch+Math.ceil((this.state.time+delayMs-this.physicsEpoch)/STEP_MS-1e-8)*STEP_MS;
  }
  checkpoint(): void {if(this.applyingCommand)return;this.store.save(this.state);this.lastCheckpoint=this.state.time;}
  snapshot(id: string, afterEvent=0): WorldSnapshot {
    const character=this.character(id);
    const groundEffects:NonNullable<WorldSnapshot['groundEffects']>=[
      ...(this.state.bookTraps??[]).filter(t=>t.expiresAt>this.state.time).map(t=>({id:t.id,kind:'trap' as const,owner:t.owner,point:t.point,radius:1.4,expiresAt:t.expiresAt,effect:'trap'})),
      ...(this.state.bookAreas??[]).filter(a=>a.remaining>0).map(a=>({id:a.owner+':'+a.id,kind:'area' as const,owner:a.owner,point:a.point,radius:a.radius,expiresAt:a.nextAt+(a.remaining-1)*a.interval,effect:a.fx})),
      ...this.state.pending.filter(a=>a.slam&&!a.released).map(a=>({id:a.actor+':slam',kind:'slam' as const,owner:a.actor,point:a.slam!,radius:4,expiresAt:a.hitAt,effect:'fire'}))
    ];
    return structuredClone({craftRecipes:RING_RECIPES,groundEffects:groundEffects.filter(e=>sameSpace(e.point,character)),worldRevision:this.finalWorld?.revision,spaceId:spaceOf(character),populationCapacity:this.finalWorld?.slots.length,protocol:WORLD_PROTOCOL,contentVersion:CONTENT_VERSION,mapVersion:this.mapContentVersion,time:this.state.time,revision:this.state.revision,environment:worldCycleAt(this.state.time,this.state.cycleEpoch!),chat:this.state.chat,character:{...character,bodyRadius:this.bodyRadius(character),attackRange:this.books.range(character),navigationPath:character.destination||character.combatState==='approach'?this.paths.get(character.id)?.points??[]:[]},
      heroes:Object.values(this.state.characters).filter(p=>p.activeUntil>this.state.time&&sameSpace(p,character)&&(!this.finalWorld||distance(p,character)<140)).map(p=>({spaceId:p.spaceId,id:p.id,name:p.name,classId:p.classId,level:p.level,x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,dead:p.dead,equipment:p.equipment,autoAttack:p.autoAttack,attackReadyAt:p.attackReadyAt,target:p.target,generation:p.generation,yOffset:p.yOffset,grounded:p.grounded,yaw:p.yaw,action:p.action,actionStartedAt:p.actionStartedAt,actionEndsAt:p.actionEndsAt,velocityX:p.velocityX,velocityZ:p.velocityZ,verticalVelocity:p.verticalVelocity,locomotionState:p.locomotionState,combatState:p.combatState,hitAt:p.hitAt,hitUntil:p.hitUntil,bodyRadius:this.bodyRadius(p),attackRange:this.books.range(p)})),
      monsters:this.state.monsters.filter(m=>sameSpace(m,character)&&(!this.finalWorld||distance(m,character)<135)).map((m):WorldMonster=>({...m,bodyRadius:this.bodyRadius(m),attackRange:this.monsterRange(m),aiState:m.alive?(this.brains.get(m.uid)?.state??'spawn'):this.state.time<(m.deathAt??0)+REFERENCE_DEATH_MS?'dead':this.state.time<(m.corpseUntil??0)?'corpse':'despawn'})),summons:this.state.summons.filter(m=>sameSpace(m,character)),events:this.events.filter(e=>e.sequence>afterEvent&&(!this.finalWorld||e.spaceId===spaceOf(character)))});
  }
  private tick(dt: number): void {
    this.expireDeadlines();
    const observers=Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time);
    this.activeMonsters=this.finalWorld?this.state.monsters.filter(m=>m.alive&&(observers.some(p=>sameSpace(p,m)&&distance(p,m)<145)||Boolean(m.targetId||m.returnFromTaunt)||['return','leash'].includes(this.brains.get(m.uid)?.state??''))):this.state.monsters.filter(m=>m.alive);
    const positions=new Map([...Object.values(this.state.characters),...this.state.monsters,...this.state.summons].map(a=>[a,{x:a.x,z:a.z}]));
    this.separateActors(dt);
    for(const p of Object.values(this.state.characters)){
      if(p.activeUntil<=this.state.time||p.dead){this.cancelAttack(p.id);p.velocityX=0;p.velocityZ=0;continue;}
      p.combatState='idle';
      p.mp=Math.min(p.maxMp,p.mp+manaRegenerationPerSecond(p.classId,p.maxMp,p.stats)*dt);
      if(this.state.time-p.lastInputAt>500)p.direction={x:0,z:0};
      let active=this.state.pending.find(a=>a.actor===p.id);
      if(active&&!this.validAttack(active)){this.cancelAttack(p.id);active=undefined;}
      const motor=this.motor(p);
      if(active){p.combatState=active.released?'recovery':'windup';const lockedTarget=this.state.monsters.find(m=>m.uid===active!.target);if(lockedTarget)p.yaw=smoothAngle(p.yaw,Math.atan2(lockedTarget.x-p.x,lockedTarget.z-p.z),9,dt);}
      let direction:Position={x:0,z:0},limit=Infinity;
      if(Math.hypot(p.direction.x,p.direction.z)>.01){direction=p.direction;}
      else if(!active){
        if(p.bufferedSkill&&p.bufferedSkill.expiresAt<=this.state.time)p.bufferedSkill=undefined;
        const target=this.state.monsters.find(m=>m.uid===p.target&&m.alive);
        if(p.target&&!target){p.target=null;p.skill=null;p.autoAttack=false;}
        let goal=p.destination;
        if(target&&!p.destination&&(p.autoAttack||p.singleAttack||p.skill!==null)){
          const skill=p.skill===null?undefined:CLASSES[p.classId as ClassId].skills[p.skill] as Skill;
          if(skill&&(p.mp<skill.cost||p.cooldowns[p.skill!]>this.state.time))p.skill=null;
          const range=this.books.range(p);
          const visible=this.lineOfSight(p,target);
          const spacing=combatSpacing(range,this.bodyRadius(p),this.bodyRadius(target));
          const approachRange=spacing.destinationDistance;
          const d=distance(p,target);if(d>range)this.approaching.add(p.id);
          if(!visible){
            // A blocked shot needs a different angle, never a zero-range chase
            // into the target's body. The usual attack range remains unchanged.
            p.combatState='approach';goal=this.firingPosition(p,target,approachRange);
            if(!goal){this.cancelControl(p);this.event('cancel',p.id,undefined,{reason:'no-free-path'});}
          }else if(d>(this.approaching.has(p.id)?spacing.stoppingDistance:range)){
            p.combatState='approach';goal=approachPoint(p,target,approachRange);
          }else{
            p.combatState='face';this.approaching.delete(p.id);this.firingPositions.delete(p.id);motor.stopPlanar();p.yaw=smoothAngle(p.yaw,Math.atan2(target.x-p.x,target.z-p.z),9,dt);
            if(p.grounded&&(p.skill!==null||p.attackReadyAt<=this.state.time)&&(p.skill!==null||facingTarget(p.yaw,p,target)))this.beginPlayerAttack(p,target);
          }
        }
        if(goal){
          if(distance(p,goal)<(p.destination?.18:.01)){if(p.destination)p.destination=null;this.paths.delete(p.id);this.pursuit.delete(p.id);}
          else{
            const progress=this.pursuit.get(p.id);
            if(!progress||distance(p,progress)>.2)this.pursuit.set(p.id,{x:p.x,z:p.z,since:this.state.time});
            else if(this.state.time-progress.since>=2500){this.cancelControl(p);this.event('cancel',p.id,undefined,{reason:'no-free-path'});goal=null;}
            if(goal){const point=this.waypoint(p,goal,.46,p.id);if(point){direction={x:point.x-p.x,z:point.z-p.z};limit=distance(p,point);}}
          }
        }else this.pursuit.delete(p.id);
      }
      const before={x:p.x,z:p.z};
      const step=motor.step(direction,p.stats.speed,dt,limit);
      this.move(p,{x:step.dx,z:step.dz},1,.46);p.yOffset=step.height;p.grounded=step.grounded;p.verticalVelocity=step.verticalVelocity;p.locomotionState=step.locomotionState;
      // Keep acceleration while sliding a wall, as the accepted browser motor does.
      const travelled=distance(before,p);
      if(!step.grounded)this.action(p,'jump');
      else if(travelled>.001){p.yaw=smoothAngle(p.yaw,Math.atan2(step.facingX,step.facingZ),16,dt);this.action(p,'walk');}
      else if(p.action==='walk'||p.action==='jump')this.action(p,'idle');
    }
    for(const m of this.activeMonsters)if(m.alive)this.monsterTick(m,dt);
    for(const attack of [...this.state.pending]){
      if(!this.state.pending.includes(attack))continue;
      if(!this.validAttack(attack)){this.cancelAttack(attack.actor);continue;}
      if(!attack.released&&attack.hitAt<=this.state.time){attack.released=true;this.resolveAttack(attack);}
      if(this.state.pending.includes(attack)&&(attack.endsAt??attack.hitAt)<=this.state.time){
        this.state.pending=this.state.pending.filter(a=>a!==attack);
        const p=this.state.characters[attack.actor];const actor=p??this.state.monsters.find(m=>m.uid===attack.actor)??this.state.summons.find(m=>m.uid===attack.actor);
        if(actor){this.action(actor,'idle');actor.combatState='idle';}
        if(p&&p.bufferedSkill){
          const buffered=p.bufferedSkill;p.bufferedSkill=undefined;const skill=CLASSES[p.classId as ClassId].skills[buffered.index] as Skill;
          const target=this.state.monsters.find(m=>m.uid===buffered.target&&m.alive);
          if(buffered.expiresAt>(attack.endsAt??this.state.time)&&p.grounded&&p.mp>=skill.cost&&p.cooldowns[buffered.index]<=this.state.time&&(buffered.target==='@self'||target?.uid===p.target)){
            if(buffered.target==='@self')this.selfSkill(p,buffered.index,skill);else p.skill=buffered.index;
          }
        }
      }
    }
    for(const projectile of [...this.state.projectiles!])this.projectileTick(projectile);
    for(const summon of this.state.summons)this.summonTick(summon,dt);
    for(const [actor,before] of positions){
      const dead='alive' in actor?!actor.alive:'dead' in actor&&actor.dead;
      actor.velocityX=dead?0:(actor.x-before.x)/dt;actor.velocityZ=dead?0:(actor.z-before.z)/dt;
    }
    for(const id of this.tradeSessions.keys())this.pruneTradeSession(this.character(id));
  }
  private expireDeadlines(): void {
    this.books.tick();this.state.bookAreas=this.state.bookAreas?.filter(a=>a.remaining>0);this.state.bookTraps=this.state.bookTraps?.filter(t=>t.expiresAt>this.state.time);
    if(this.state.time>=this.nextEnvironmentCheck){this.updateEnvironment();this.nextEnvironmentCheck=this.state.time+1000;}
    for(const p of Object.values(this.state.characters))if(p.buffs.haste&&p.buffs.haste<=this.state.time){p.buffs.haste=0;this.recalculate(p);}
    for(const m of this.state.monsters) if(m.nightIndex===undefined&&!m.temporaryOwner&&!m.alive&&m.respawnAt<=this.state.time){
      Object.assign(m,{...motion(this.state.time),...m.home,hp:monsterDef(m).hp,alive:true,attackReadyAt:this.state.time+(250+this.random()*550),phase:1,generation:m.generation+1,status:{slow:0,stun:0,dot:0,nextDot:0},owner:undefined});
      m.bookEffects=[];m.bookDots=[];m.returnFromTaunt=false;m.provokedBy=undefined;m.targetId=null;m.deathAt=undefined;m.corpseUntil=undefined;this.paths.delete(m.uid);
      m.patrolStep=Math.floor(this.random()*Math.max(1,this.patrolPoints(m).length));
      const brain=this.brains.get(m.uid)??new MonsterAiBrain();
      brain.reset(m.home.x*.173+m.home.z*.127+m.generation);this.brains.set(m.uid,brain);
      this.event('respawn',m.uid);
    }
    this.state.summons=this.state.summons.filter(s=>s.expiresAt>this.state.time);
    if(this.finalWorld){
      const expired=this.state.monsters.filter(m=>m.temporaryOwner&&(!this.state.monsters.some(owner=>owner.uid===m.temporaryOwner&&owner.alive&&owner.generation===m.ownerGeneration&&this.brains.get(owner.uid)?.state!=='return')||((m.temporaryUntil??0)<=this.state.time)));
      for(const m of expired){this.cancelAttack(m.uid);this.brains.delete(m.uid);this.paths.delete(m.uid);this.patrols.delete(m.uid);}
      const ids=new Set(expired.map(m=>m.uid));
      this.state.monsters=this.state.monsters.filter(m=>!ids.has(m.uid));
    }
  }
  private beginPlayerAttack(p:WorldCharacter,target:WorldMonster):void {
    const skill=p.skill===null?undefined:CLASSES[p.classId as ClassId].skills[p.skill] as Skill;
    if(skill&&(p.mp<skill.cost||p.cooldowns[p.skill!]>this.state.time)){p.skill=null;return;}
    this.provoke(target,p);
    if(skill){p.mp-=skill.cost;p.cooldowns[p.skill!]=this.state.time+skill.cd*1000;}
    const cls=CLASSES[p.classId as ClassId];const profile=classCombatProfile(p.classId,p.level,p.stats);
    p.attackReadyAt=Math.max(p.attackReadyAt,this.state.time+profile.attackInterval*1000/(((p.buffs.haste??0)>this.state.time?1.15:1)*this.books.attackSpeed(p)));
    const timing=attackTimings(cls.model,(p.attackReadyAt-this.state.time)/1000*.92);
    const damageType=attackDamageType(p.classId,Boolean(skill));
    const base=damageType==='magic'?p.stats.matk:p.stats.atkMin+this.random()*(p.stats.atkMax-p.stats.atkMin);
    const critical=this.random()<p.stats.crit/100;
    const damage=base*(skill?.mul??1)*(critical?profile.critMultiplier:1);
    const attack:PendingAttack={actor:p.id,target:target.uid,generation:target.generation,actorGeneration:p.generation,
      hitAt:skill?this.state.time:this.tickDeadline(timing.windup),endsAt:this.tickDeadline(skill?180:timing.duration),skill:p.skill,monster:false,damage,critical,accuracy:accuracyForDamage(p.stats,damageType),resourcePaid:Boolean(skill)};
    this.state.pending.push(attack);this.motor(p).stopPlanar();this.action(p,'attack',attack.endsAt);p.combatState='windup';p.hitAt=attack.hitAt;
    this.event('attack',p.id,target.uid,{skill:p.skill,generation:target.generation,impactAt:attack.hitAt,endsAt:attack.endsAt,readyAt:p.attackReadyAt,actorGeneration:p.generation});p.skill=null;p.singleAttack=false;
    // Ready skills release on this input boundary. A second skill received
    // before the next physics tick must not consume the first without firing.
    if(skill&&this.validAttack(attack)){attack.released=true;this.resolveAttack(attack);}
  }
  private validAttack(a:PendingAttack):boolean {
    if(a.summon){const s=this.state.summons.find(s=>s.uid===a.actor),p=this.state.characters[a.owner??''];return Boolean(s&&s.expiresAt>this.state.time&&p&&!p.dead&&p.activeUntil>this.state.time&&p.generation===a.actorGeneration&&this.state.monsters.some(m=>m.uid===a.target&&m.alive&&m.generation===a.generation));}
    if(a.monster){const m=this.state.monsters.find(m=>m.uid===a.actor&&m.alive);const p=this.state.characters[a.target];
      return Boolean(m&&p&&sameSpace(m,p)&&!p.dead&&p.generation===a.generation&&m.generation===(a.actorGeneration??m.generation)&&p.activeUntil>this.state.time&&!this.safe(p)&&p.buffs.vanish<=this.state.time&&m.status.stun<=this.state.time);}
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation);
    return Boolean(p&&!p.dead&&p.activeUntil>this.state.time&&p.generation===(a.actorGeneration??p.generation)&&target&&sameSpace(p,target)&&p.target===target.uid);
  }
  private resolveAttack(a:PendingAttack):void {
    if(a.summon){const s=this.state.summons.find(s=>s.uid===a.actor)!,p=this.state.characters[a.owner!],m=this.state.monsters.find(m=>m.uid===a.target&&m.alive)!;
      s.combatState='recovery';if(distance(s,m)>Math.max(1.8,this.bodyRadius(s)+this.bodyRadius(m)+.04)+.1||!this.lineOfSight(s,m)||!facingTarget(s.yaw,s,m))return;
      this.event('release',s.uid,m.uid,{effect:'slash',durationMs:0,generation:m.generation});this.damage(m,a.damage!,p,false);return;}
    if(a.monster){
      const m=this.state.monsters.find(m=>m.uid===a.actor&&m.alive)!;const p=this.state.characters[a.target];
      if(a.slam){for(const victim of Object.values(this.state.characters).filter(v=>sameSpace(m,v)&&!v.dead&&v.activeUntil>this.state.time&&!this.safe(v)&&distance(v,a.slam!)<=4&&this.lineOfSight(m,v)))this.monsterHit(m,victim,1.4);return;}
      if(distance(m,p)>=this.monsterRange(m)+.25||!this.lineOfSight(m,p)||!facingTarget(m.yaw,m,p))return;
      m.combatState='recovery';
      this.monsterHit(m,p);return;
    }
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation)!;
    const cls=CLASSES[p.classId as ClassId];

    if(distance(p,target)>this.books.range(p)+(cls.ranged ? .05 : .25)||!this.lineOfSight(p,target)){this.cancelAttack(p.id);this.event('cancel',p.id,target.uid,{skill:a.skill,reason:'out-of-reach'});return;}
    const skill=a.skill===null?undefined:cls.skills[a.skill] as Skill;
    if(skill){
      if(!a.resourcePaid){if(p.mp<skill.cost||p.cooldowns[a.skill!]>this.state.time){this.cancelAttack(p.id);return;}p.mp-=skill.cost;p.cooldowns[a.skill!]=this.state.time+skill.cd*1000;}
    }
    p.combatState='recovery';
    const effect=skill?.fx??(p.classId==='mage'||p.classId==='necro'?'fire':'arrow');
    const origin={spaceId:p.spaceId,x:p.x,z:p.z,y:this.terrainFor(p).supportAt(p.x,p.z)+1.4};
    this.event('release',p.id,target.uid,{skill:a.skill,generation:a.generation,actorGeneration:p.generation,effect:cls.ranged?effect:'slash',durationMs:cls.ranged&&effect!=='lightning'&&effect!=='slash'?280:0,origin,destination:{x:target.x,z:target.z,y:this.terrainFor(target).supportAt(target.x,target.z)+1.4}});
    const strike={actor:p.id,target:target.uid,generation:target.generation,actorGeneration:p.generation,skill:a.skill,damage:a.damage!,critical:Boolean(a.critical),accuracy:a.accuracy!};
    if(!cls.ranged||effect==='lightning'||effect==='slash')this.strike(strike);
    else{this.state.projectiles!.push({...strike,origin,point:{...origin},startedAt:this.state.time,endsAt:this.state.time+280});}
  }
  private monsterHit(m:WorldMonster,p:WorldCharacter,multiplier=1):void {
      const base=Math.max(1,Math.round(monsterDef(m).atk*multiplier*(m.id==='rift_boss'?1:1+(m.phase-1)*.32)-p.stats.def*.2));

      const amount=p.buffs.guard>this.state.time?Math.max(1,Math.round(base*.5)):base;
      this.books.attacked(p,m);
      if(this.random()<Math.max(0,Math.min(.75,p.stats.evasion/100))){this.event('miss',m.uid,p.id);return;}
      p.hp=Math.max(0,p.hp-amount);p.hitUntil=this.state.time+180;this.event('release',m.uid,p.id,{effect:'slash',durationMs:0,generation:p.generation});this.event('hit',m.uid,p.id,{amount,targetHp:p.hp,targetMaxHp:p.maxHp,targetGeneration:p.generation,generation:p.generation});
      if(!p.hp){p.dead=true;p.xp=Math.max(0,p.xp-Math.floor(p.xp*.05));this.cancelControl(p);this.action(p,'death');p.combatState='dead';this.motor(p).reset();p.yOffset=0;p.verticalVelocity=0;p.grounded=true;this.event('death',p.id,undefined,{generation:p.generation,position:{x:p.x,z:p.z,yOffset:p.yOffset,yaw:p.yaw}});this.checkpoint();}
  }
  private projectileTick(projectile:Projectile):void {
    const target=this.state.monsters.find(m=>m.uid===projectile.target&&m.alive&&m.generation===projectile.generation);
    const remove=()=>{this.state.projectiles=this.state.projectiles!.filter(p=>p!==projectile);};
    if(!target||!sameSpace(projectile.origin,target)){remove();return;}
    const t=Math.min(1,(this.state.time-projectile.startedAt)/(projectile.endsAt-projectile.startedAt));
    const end={x:target.x,z:target.z,y:this.terrainFor(target).supportAt(target.x,target.z)+1.4};
    const next={spaceId:projectile.origin.spaceId,x:projectile.origin.x+(end.x-projectile.origin.x)*t,z:projectile.origin.z+(end.z-projectile.origin.z)*t,y:projectile.origin.y+(end.y-projectile.origin.y)*t};
    if(!this.collisionFor(target).hasLineOfSight(projectile.point,next,.025)||next.y<this.terrainFor(target).heightAt(next.x,next.z)+.04){remove();return;}
    projectile.point=next;if(this.state.time>=projectile.endsAt){remove();this.strike(projectile);}
  }
  private strike(a:Pick<Projectile,'actor'|'target'|'generation'|'actorGeneration'|'skill'|'damage'|'critical'|'accuracy'>):void {
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation);
    if(!p||!target||!sameSpace(p,target)||p.generation!==a.actorGeneration)return;
    const skill=a.skill===null?undefined:CLASSES[p.classId as ClassId].skills[a.skill] as Skill;
    const hit=(m:WorldMonster,amount:number,critical=false)=>{
      if(!resolveAttackAccuracy(a.accuracy,this.random()).hit){this.event('miss',p.id,m.uid,{skill:a.skill,generation:m.generation});return false;}
      const magical=attackDamageType(p.classId,Boolean(skill))==='magic';
      this.damage(m,this.books.normalDamage(p,amount)+this.books.value(m,magical?'mdefDown':'defDown')*.2,p,critical);if(!magical)this.books.physicalHit(p,m);return true;
    };
    let primary=false;
    if(skill?.chain){
      const hits=resolveChainLightning(target,this.state.monsters.filter(m=>sameSpace(m,target)),{maxTargets:skill.chain,radius:skill.chainRadius??6.5,falloff:skill.chainFalloff??.76});
      primary=hit(target,a.damage,a.critical);
      if(primary)for(const jump of hits.slice(1)){
        if(!jump.target.alive||!jump.source||!this.lineOfSight(jump.source,jump.target))break;
        this.event('release',jump.source.uid,jump.target.uid,{skill:a.skill,effect:'lightning',durationMs:0,generation:jump.target.generation});
        if(!hit(jump.target,Math.max(1,Math.round(a.damage*jump.multiplier))))break;
      }
    }else{
      const victims=[target,...(skill?.aoe?this.state.monsters.filter(m=>m!==target&&m.alive&&distance(m,target)<skill.aoe!&&this.lineOfSight(target,m)):[])];
      victims.forEach((m,index)=>{const connected=hit(m,Math.round(a.damage*(index ? .72 : 1)),a.critical&&index===0);if(!index)primary=connected;});
    }
    if(!primary)return;
    if(target.alive&&skill){
      if(skill.stun){target.status.stun=this.state.time+skill.stun*1000;this.cancelAttack(target.uid);}
      if(skill.slow)target.status.slow=this.state.time+skill.slow*1000;
      if(skill.dot){target.status.dot=this.state.time+skill.dot*1000;target.status.nextDot=this.state.time;target.status.dotOwner=p.id;}
      if(skill.knock){const len=Math.max(.001,distance(p,target));this.move(target,{x:(target.x-p.x)/len,z:(target.z-p.z)/len},skill.knock,this.monsterRadius(target));}
    }
    if(skill?.leech&&!p.dead&&p.generation===a.actorGeneration)p.hp=Math.min(p.maxHp,p.hp+Math.round(a.damage*skill.leech));
  }
  private monsterTick(m:WorldMonster,dt:number):void {
    const region=this.finalWorld?.slotById.get(m.uid)??SPAWN_REGIONS.find(r=>r.id===m.regionId);
    const def=monsterDef(m),radius=this.monsterRadius(m),boss='boss' in def;
    if(m.status.dot>this.state.time&&this.random()<dt){const p=this.state.characters[m.status.dotOwner??''];if(p)this.damage(m,Math.max(2,Math.round(p.stats.matk*.08)),p,false);m.status.nextDot=this.state.time;}
    if(!m.alive)return;
    if(m.returnFromTaunt){this.cancelAttack(m.uid);if(distance(m,m.home)>.6)this.walk(m,m.home,monsterMovementSpeed(boss)*dt,radius,m.uid,dt);else m.returnFromTaunt=false;return;}
    if(m.status.stun>this.state.time||this.books.value(m,'sleep')){this.cancelAttack(m.uid);this.action(m,'idle');m.combatState='idle';return;}
    let brain=this.brains.get(m.uid);
    if(!brain){brain=new MonsterAiBrain(m.home.x*.173+m.home.z*.127+m.patrolIndex*1.91);this.brains.set(m.uid,brain);}
    const candidates=Object.values(this.state.characters).filter(p=>sameSpace(m,p)&&!p.dead&&p.activeUntil>this.state.time&&!this.safe(p)&&p.buffs.vanish<=this.state.time);
    const active=this.state.pending.find(a=>a.actor===m.uid);
    // Browser acquisition was radial. Navigation resolves obstacles during
    // chase; line of sight validates the actual attack, not a new search timer.
    const taunt=this.books.effects(m).find(e=>e.values.taunt);
    if(taunt&&brain.targetId!==taunt.owner)brain.engage(taunt.owner);
    const retained=taunt?.owner??m.provokedBy??brain.targetId??active?.target;
    const target=retained?candidates.find(p=>p.id===retained):candidates.sort((a,b)=>distance(m,a)-distance(m,b))[0];
    const visible=Boolean(target&&this.lineOfSight(m,target));
    const points=this.patrolPoints(m);
    let point=points[(m.patrolStep??0)%Math.max(1,points.length)];
    const leashRadius=region?.leashRadius??(boss?18:14);
    const decision=brain.update({dt,alive:true,playerSafe:false,targetAvailable:Boolean(target),targetId:target?.id,
      provoked:Boolean(m.provokedBy),playerDistance:target?distance(m,target):1000,homeDistance:distance(m,m.home),
      atPatrolPoint:!point||distance(m,point)<.55,aggroRadius:region?.aggroRadius??(boss?11:9),
      leashRadius,attackRange:this.monsterRange(m)});
    m.targetId=decision.targetId;m.combatState='idle';
    if(decision.changed&&decision.intent==='return'&&['fire_golem','ice_golem','rift_boss',CAVE_BOSS_ID].includes(m.id)){
      this.cancelAttack(m.uid);m.hp=def.hp;m.phase=1;m.owner=undefined;m.bookDots=[];m.bookEffects=[];m.nextSlamAt=undefined;
    }
    if(m.pairId&&m.targetId&&target&&['chase','attack'].includes(decision.intent)){
      for(const partner of this.state.monsters.filter(p=>p.pairId===m.pairId&&p.uid!==m.uid&&p.alive)){
        const companion=this.brains.get(partner.uid)??new MonsterAiBrain();companion.engage(target.id);this.brains.set(partner.uid,companion);partner.targetId=target.id;
      }
    }
    // The accepted build selects the next patrol point on entering Patrol.
    if(decision.changed&&decision.state==='patrol'&&points.length){m.patrolStep=((m.patrolStep??0)+1)%points.length;point=points[m.patrolStep];}
    if(!target||decision.intent==='return'||decision.state==='idle'){m.provokedBy=undefined;}
    const rage=m.provokedBy?1.25:1;
    const speed=monsterMovementSpeed(boss)*rage*(m.status.slow>this.state.time?.45:1)*(1-this.books.value(m,'slow')/100);
    if(active){
      if(this.validAttack(active)&&distance(m,m.home)<leashRadius){
        m.combatState=active.released?'recovery':'windup';
        if(target)m.yaw=smoothAngle(m.yaw,Math.atan2(target.x-m.x,target.z-m.z),9,dt);return;
      }
      this.cancelAttack(m.uid);
    }
    if(target&&(decision.intent==='chase'||decision.intent==='attack')){
      if(decision.intent==='chase'||!visible){
        m.combatState='approach';this.walk(m,target,speed*dt,radius,m.uid,dt);
      }else{
        // Rotate during windup, as in the reference, rather than inserting an
        // extra facing wait before the animation. Contact still checks facing.
        m.combatState='face';this.action(m,'idle');m.yaw=smoothAngle(m.yaw,Math.atan2(target.x-m.x,target.z-m.z),9,dt);
        if(m.attackReadyAt<=this.state.time){
          m.attackReadyAt=this.state.time+(m.id==='fire_golem'?2500:m.id==='ice_golem'?2800:[CAVE_BOSS_ID,'rift_boss'].includes(m.id)?2400:(boss?1450:2050)/rage)/(1-this.books.value(m,'attackSlow')/100);
          const slam=m.id===CAVE_BOSS_ID||m.id==='rift_boss'&&(m.nextSlamAt??0)<=this.state.time;
          const slamPoint=m.id===CAVE_BOSS_ID?{x:target.x,z:target.z,spaceId:m.spaceId}:{x:m.x,z:m.z,spaceId:m.spaceId};
          if(slam)m.nextSlamAt=this.state.time+9000;
          const custom=m.id==='fire_golem'?{duration:1500,windup:900}:m.id==='ice_golem'?{duration:1700,windup:1100}:[CAVE_BOSS_ID,'rift_boss'].includes(m.id)?{duration:slam?1900:1600,windup:slam?1400:1000}:null;
          const rawTiming=custom??attackTimings(def.model),timing={duration:rawTiming.duration/(custom?1:rage),windup:rawTiming.windup/(custom?1:rage)},endsAt=this.tickDeadline(timing.duration),impactAt=this.tickDeadline(timing.windup);
          this.state.pending.push({actor:m.uid,target:target.id,generation:target.generation,actorGeneration:m.generation,hitAt:impactAt,endsAt,skill:null,monster:true,...(slam?{slam:slamPoint}:{})});
          this.action(m,'attack',endsAt);m.combatState='windup';m.hitAt=impactAt;
          this.event('attack',m.uid,target.id,{impactAt,endsAt,generation:target.generation,actorGeneration:m.generation,...(slam?{effect:'slam',origin:{...slamPoint,y:this.terrainFor(m).supportAt(slamPoint.x,slamPoint.z)},durationMs:1400}:{})});
        }
      }
    }else if(decision.intent==='return'){
      this.cancelAttack(m.uid);this.walk(m,m.home,monsterMovementSpeed(boss)*dt*.9,radius,m.uid,dt);
    }else if(decision.intent==='patrol'&&point){
      this.walk(m,point,monsterMovementSpeed(boss)*dt*.46,radius,m.uid,dt);
    }else{this.paths.delete(m.uid);this.action(m,'idle');}
  }
  private patrolPoints(m:WorldMonster):Position[] {
    let points=this.patrols.get(m.uid);
    if(!points){
      const region=this.finalWorld?.slotById.get(m.uid)??SPAWN_REGIONS.find(r=>r.id===m.regionId);
      if(this.finalWorld){points=this.finalWorld.slotById.get(m.uid)?.patrol??[];this.patrols.set(m.uid,points);return points;}
      points=region&&!region.boss?patrolRouteInRegion(region as (typeof SPAWN_REGIONS)[number],m.home,m.patrolIndex).map(point=>this.collision.findNearestFree(point,this.monsterRadius(m))):[];
      this.patrols.set(m.uid,points);
    }
    return points;
  }
  private selfSkill(p:WorldCharacter,index:number,skill:Skill):void {
    if(p.mp<skill.cost||p.cooldowns[index]>this.state.time)return;
    p.mp-=skill.cost;p.cooldowns[index]=this.state.time+skill.cd*1000;
    if(skill.buff==='guard')p.buffs.guard=this.state.time+7000;
    if(skill.buff==='vanish')p.buffs.vanish=this.state.time+4000;
    if(skill.summon){this.state.summons.push({...motion(this.state.time),...this.collisionFor(p).findNearestFree({x:p.x+1.2,z:p.z+1.2},.42),spaceId:p.spaceId,uid:this.identifier(),owner:p.id,expiresAt:this.state.time+20000,attackReadyAt:0});this.event('summon',p.id);}
    else this.event('buff',p.id,undefined,{skill:index});
  }
  private summonTick(s:WorldSummon,dt:number):void {
    if(this.books.summonTick(s,dt,(a,g,step)=>this.walk(a,g,step,.42,a.uid,dt)))return;
    const p=this.state.characters[s.owner];if(!p||p.dead||!sameSpace(s,p)||p.activeUntil<=this.state.time){this.cancelAttack(s.uid);this.action(s,'idle');return;}
    const active=this.state.pending.find(a=>a.actor===s.uid);
    const target=active?this.state.monsters.find(m=>m.uid===active.target&&m.alive)
      :this.state.monsters.filter(m=>m.alive&&sameSpace(s,m)).sort((a,b)=>distance(s,a)-distance(s,b))[0];
    if(!target){this.cancelAttack(s.uid);this.action(s,'idle');return;}
    if(active){s.yaw=smoothAngle(s.yaw,Math.atan2(target.x-s.x,target.z-s.z),16,dt);return;}
    const range=Math.max(1.8,this.bodyRadius(s)+this.bodyRadius(target)+.04);
    if(distance(s,target)>range||!this.lineOfSight(s,target))this.walk(s,approachPoint(s,target,range-.02),3.6*dt,.42,s.uid,dt);
    else{
      this.action(s,'idle');s.yaw=smoothAngle(s.yaw,Math.atan2(target.x-s.x,target.z-s.z),16,dt);
      if(s.attackReadyAt<=this.state.time&&facingTarget(s.yaw,s,target)){
        s.attackReadyAt=this.state.time+1250;const timing=attackTimings('Skeleton');
        s.hitAt=this.tickDeadline(timing.windup);this.action(s,'attack',this.tickDeadline(timing.duration));s.combatState='windup';
        this.state.pending.push({actor:s.uid,owner:p.id,target:target.uid,generation:target.generation,actorGeneration:p.generation,skill:null,monster:false,summon:true,hitAt:s.hitAt,endsAt:s.actionEndsAt,damage:Math.max(5,Math.round(p.stats.matk*.3))});
        this.event('attack',s.uid,target.uid,{impactAt:s.hitAt,endsAt:s.actionEndsAt,generation:target.generation});
      }
    }
  }
  private damage(m:WorldMonster,amount:number,p:WorldCharacter,critical:boolean):void {
    if(!m.alive||!sameSpace(m,p))return;for(const e of m.bookEffects??[])if(e.values.taunt&&e.owner===p.id)e.values.struck=1;this.provoke(m,p);m.hp=Math.max(0,m.hp-amount);m.owner??=p.id;m.hitUntil=this.state.time+180;this.event('hit',p.id,m.uid,{amount,critical,targetHp:m.hp,targetMaxHp:monsterDef(m).hp,targetGeneration:m.generation,generation:m.generation});
    const def=monsterDef(m);
    if(m.id==='rift_boss'&&m.hp>0&&m.hp<=def.hp*.5&&m.phase===1){m.phase=2;this.event('buff',m.uid,undefined,{effect:'rift-rage'});}
    if(m.id==='big'){
      const phase=m.hp/def.hp<=.3?3:m.hp/def.hp<=.65?2:1;
      if(phase>m.phase){m.phase=phase;for(let i=0;i<phase+1;i++){const a=i/(phase+1)*Math.PI*2;const uid=this.identifier();this.spawnMonster(phase===2?'wraith':'bat',{x:m.x+Math.cos(a)*4,z:m.z+Math.sin(a)*4,spaceId:m.spaceId},uid);const spawned=this.state.monsters.find(n=>n.uid===uid);if(this.finalWorld&&spawned)Object.assign(spawned,{temporaryOwner:m.uid,ownerGeneration:m.generation,temporaryUntil:this.state.time+120000});}}
    }
    if(m.hp===0){
      m.alive=false;
      m.deathAt=this.state.time;m.corpseUntil=this.state.time+REFERENCE_DEATH_MS+REFERENCE_CORPSE_MS;
      // Browser MonsterLifecycle starts its existing respawn delay after corpse
      // display, rather than consuming that delay while the body is visible.
      m.respawnAt=m.id===CAVE_BOSS_ID?this.state.time+CAVE_BOSS_RESPAWN_MS:m.corpseUntil+(m.id==='rift_boss'?3600:m.id.includes('golem')?45+this.random()*15:'boss' in def?bossRespawnSeconds(def.boss as 'mini'|'big',this.random):28+this.random()*20)*1000;
      m.targetId=null;m.velocityX=0;m.velocityZ=0;m.combatState='dead';this.brains.get(m.uid)?.forceLifecycle('dead');this.paths.delete(m.uid);
      this.cancelAttack(m.uid);this.action(m,'death');this.event('death',m.uid,undefined,{generation:m.generation,endsAt:m.corpseUntil,position:{x:m.x,z:m.z,yOffset:m.yOffset,yaw:m.yaw}});
      for(const player of Object.values(this.state.characters))if(player.target===m.uid)this.cancelControl(player);
      this.state.pending=this.state.pending.filter(a=>a.target!==m.uid);
      const owner=this.state.characters[m.owner]??p;owner.kills++;if('boss' in def)owner.bossKills++;
      const earnedXp=Math.round(def.xp*this.xpRate);const gained=applyExperience(owner.level,owner.xp,earnedXp);owner.level=gained.level;owner.xp=gained.xp;
      if(gained.levelsGained){this.recalculate(owner);if(!owner.dead){owner.hp=owner.maxHp;owner.mp=owner.maxMp;}}
      const gold=Math.floor(def.gold[0]+this.random()*(def.gold[1]-def.gold[0]+1));owner.gold+=gold;
      const items:string[]=[];
      for(const drop of rollLootV3(m.id,this.random))for(let n=0;n<drop.count;n++){this.addItem(owner,drop.id);items.push(drop.id);}
      if(owner.quest===1&&owner.kills>=8)owner.quest=2;
      if(owner.quest===2&&m.id==='mini')owner.quest=3;
      if(owner.quest===3&&m.id==='big')owner.quest=4;
      for(const level of [50,60]){const id=`book_${owner.classId}_${level}`;if(owner.bookQuests?.[id]==='active'&&m.id===(level===50?'big':'rift_boss'))owner.bookQuests[id]='ready';}
      this.event('loot',owner.id,m.uid,{gold,xp:earnedXp,items});this.checkpoint();
    }
  }
  private spawnMonster(id:string,point:Position,uid:string,regionId?:string,index=0):void {
    const def=MONSTERS[id as MonsterId];const home={...this.collisionFor(point).findNearestFree(point,[CAVE_BOSS_ID,'rift_boss'].includes(id)?1.5:id.includes('golem')?1:id==='big'?1.2:id==='mini'?.9:.42),...(this.finalWorld?{spaceId:spaceOf(point)}:{})};
    if(this.finalWorld&&this.collisionFor(point).isBlocked(home,.46)){
      if(this.finalWorld.slotById.has(uid))throw Error('final-spawn-blocked:'+uid);
      return; // A temporary summon cannot materialize inside a wall or cliff.
    }
    this.state.monsters.push({...motion(this.state.time),...home,uid,id,home,regionId,patrolIndex:index,patrolStep:index%3,hp:def.hp,alive:true,respawnAt:0,attackReadyAt:this.state.time+this.random()*1000,generation:1,phase:1,status:{slow:0,stun:0,dot:0,nextDot:0}});
  }
  private provoke(m:WorldMonster,p:WorldCharacter):void {
    if(!m.alive||p.dead||!sameSpace(m,p)||this.safe(p))return;
    const group=m.pairId?this.state.monsters.filter(n=>n.pairId===m.pairId&&n.alive):[m];
    for(const actor of group){if(actor.targetId!==p.id)this.cancelAttack(actor.uid);actor.provokedBy=p.id;actor.targetId=p.id;const brain=this.brains.get(actor.uid)??new MonsterAiBrain();brain.engage(p.id);this.brains.set(actor.uid,brain);}
  }
  private updateEnvironment():void {
    // FINAL 1.0 allocates both night species inside the fixed 1000 slots.
    // Do not append the old random nightly population to the new world.
    if(this.finalWorld)return;
    const env=worldCycleAt(this.state.time,this.state.cycleEpoch!);
    if(!env.night){
      const ids=new Set(this.state.monsters.filter(m=>m.nightIndex!==undefined).map(m=>m.uid));
      if(ids.size){this.state.monsters=this.state.monsters.filter(m=>!ids.has(m.uid));this.state.pending=this.state.pending.filter(a=>!ids.has(a.actor)&&!ids.has(a.target));this.state.projectiles=this.state.projectiles!.filter(a=>!ids.has(a.target));for(const id of ids){this.brains.delete(id);this.paths.delete(id);}for(const p of Object.values(this.state.characters))if(p.target&&ids.has(p.target)){p.target=null;p.autoAttack=false;p.singleAttack=false;p.skill=null;}}
      return;
    }
    if(this.state.nightSpawned!==env.cycle){
      // Eight small groups; random open positions outside towns, approach and player bodies.
      this.state.monsters=this.state.monsters.filter(m=>m.nightIndex===undefined);
      for(let i=0;i<8;i++)for(let attempt=0;attempt<60;attempt++){
        const point=this.collision.findNearestFree({x:-132+this.random()*264,z:-112+this.random()*214},.5);
        if(this.safe(point)||this.collision.isBlocked(point,.5)||Object.values(this.state.characters).some(p=>distance(p,point)<15))continue;
        const other=this.collision.findNearestFree({x:point.x+2,z:point.z+1},.5);
        if(env.fullMoon&&(this.safe(other)||this.collision.isBlocked(other,.5)||distance(point,other)>4||Object.values(this.state.characters).some(p=>distance(p,other)<15)))continue;
        const pairId=`night:${env.cycle}:${i}`;
        this.spawnMonster('night_zombie',point,pairId+':z');Object.assign(this.state.monsters.at(-1)!,{nightIndex:env.cycle,pairId});
        if(env.fullMoon){this.spawnMonster('night_skeleton',other,pairId+':s');Object.assign(this.state.monsters.at(-1)!,{nightIndex:env.cycle,pairId});}
        break;
      }this.state.nightSpawned=env.cycle;
    }
    for(const m of this.state.monsters.filter(m=>m.pairId&&m.alive&&m.targetId))for(const partner of this.state.monsters.filter(p=>p.pairId===m.pairId&&p.uid!==m.uid&&p.alive)){
      const p=this.state.characters[m.targetId!];if(p&&!this.safe(p)&&!p.dead){const brain=this.brains.get(partner.uid)??new MonsterAiBrain();brain.engage(p.id);this.brains.set(partner.uid,brain);partner.targetId=p.id;}
    }
  }
  private firingPosition(p:WorldCharacter,target:WorldMonster,range:number):Position|null {
    const cached=this.firingPositions.get(p.id);
    if(cached&&cached.target===target.uid&&cached.expiresAt>this.state.time&&distance(cached.origin,target)<.7
      &&!this.collisionFor(p).isBlocked(cached.goal,.46)&&this.lineOfSight(cached.goal,target))return cached.goal;
    const angle=Math.atan2(p.z-target.z,p.x-target.x);
    const candidates:Position[]=[];
    for(let i=0;i<24;i++){
      const offset=(i===0?0:Math.ceil(i/2)*(i%2?1:-1))*Math.PI/12;
      const goal={spaceId:p.spaceId,x:target.x+Math.cos(angle+offset)*range,z:target.z+Math.sin(angle+offset)*range};
      if(goal.x<this.boundsFor(p)[0]||goal.x>this.boundsFor(p)[2]||goal.z<this.boundsFor(p)[1]||goal.z>this.boundsFor(p)[3]||this.collisionFor(p).isBlocked(goal,.46)||!this.lineOfSight(goal,target))continue;
      candidates.push(goal);
    }
    candidates.sort((a,b)=>distance(p,a)-distance(p,b));
    for(const goal of candidates){
      const points=findNavigationPath(this.collisionFor(p),p,goal,{actorRadius:.46,cellSize:.85,margin:24,maxVisited:4500});
      if(!points.length)continue;
      // Navigation knows terrain, while live actor spacing is resolved each tick.
      // Reject routes through the monster instead of walking against its body.
      const clearance=Math.min(distance(p,target)-.05,this.bodyRadius(p)+this.bodyRadius(target)+.2);
      let from:Position=p,clear=true;
      for(const to of points){
        const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
        const t=length?Math.max(0,Math.min(1,((target.x-from.x)*dx+(target.z-from.z)*dz)/length)):0;
        if(distance({x:from.x+dx*t,z:from.z+dz*t},target)<clearance){clear=false;break;}
        from=to;
      }
      if(!clear)continue;
      this.paths.set(p.id,{goal:{...goal},points,expiresAt:this.state.time+650});
      this.firingPositions.set(p.id,{target:target.uid,origin:{x:target.x,z:target.z},goal,expiresAt:this.state.time+1200});
      return goal;
    }
    this.firingPositions.delete(p.id);return null;
  }
  private waypoint(actor:Position,goal:Position,radius:number,key:string):Position|undefined {
    const player=Boolean(this.state.characters[key]);
    let path=this.paths.get(key);
    if(!path||(path.expiresAt<=this.state.time&&(distance(path.goal,goal)>.7||!path.points.length))){
      const points=findNavigationPath(this.collisionFor(actor),actor,goal,{actorRadius:radius,cellSize:.85,margin:player?24:10,maxVisited:4500});
      path={goal:{...goal},points,expiresAt:this.state.time+(points.length?(player?180:650):1000)};this.paths.set(key,path);
    }
    // Combat destinations can be close to the body-clearance limit. Do not
    // discard that final segment before the range check has actually passed.
    const arrival=(this.state.characters[key]?.combatState==='approach'||this.state.summons.some(s=>s.uid===key))?.01:player?.1:.24;
    while(path.points.length&&distance(actor,path.points[0])<arrival)path.points.shift();
    return path.points[0];
  }
  private walk(actor:Position & WorldMotion,goal:Position,step:number,radius:number,key:string,dt=.05):void {
    const point=this.waypoint(actor,goal,radius,key);if(!point){this.action(actor,'idle');return;}
    const d=Math.max(.0001,distance(actor,point)),before={x:actor.x,z:actor.z};
    let x=(point.x-actor.x)/d,z=(point.z-actor.z)/d;
    if('uid' in actor)for(const neighbor of this.activeMonsters){
      if(neighbor===actor||!neighbor.alive||!sameSpace(neighbor,actor))continue;
      const sx=actor.x-neighbor.x,sz=actor.z-neighbor.z,gap=Math.hypot(sx,sz);
      const desiredGap=this.bodyRadius(actor)+this.bodyRadius(neighbor)+.18;
      if(gap>.001&&gap<desiredGap){x+=(sx/gap)*(desiredGap-gap)*.85;z+=(sz/gap)*(desiredGap-gap)*.85;}
    }
    const length=Math.max(.001,Math.hypot(x,z));
    this.move(actor,{x:x/length,z:z/length},Math.min(d,step),radius);
    if(distance(before,actor)>.0001){actor.yaw=smoothAngle(actor.yaw,Math.atan2(point.x-before.x,point.z-before.z),9,dt);this.action(actor,'walk');}
    else {this.action(actor,'idle');this.paths.delete(key);}
  }
  private move(actor:Position,direction:Position,step:number,radius:number):void {
    let delta={x:direction.x*step,z:direction.z*step};
    const actorRadius=this.bodyRadius(actor);
    for(const other of [...Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time),...this.activeMonsters]){
      if(other===actor||!sameSpace(other,actor))continue;const combined=actorRadius+this.bodyRadius(other);
      if(Math.abs(other.x-actor.x)>combined+Math.abs(delta.x)||Math.abs(other.z-actor.z)>combined+Math.abs(delta.z))continue;
      delta=slidePastActor(actor,delta,other,combined);
    }
    const moved=this.collisionFor(actor).resolve(actor,delta,radius);
    const b=this.boundsFor(actor);actor.x=Math.max(b[0],Math.min(b[2],moved.x));actor.z=Math.max(b[1],Math.min(b[3],moved.z));
  }
  private separateActors(dt:number):void {
    const actors=[...Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time),...this.activeMonsters];
    const budgets=new Map(actors.map(actor=>[actor,dt*1.6]));
    const radii=actors.map(actor=>this.bodyRadius(actor));
    // Only resolve existing penetration (e.g. a respawn or converging crowd).
    // Swept motion handles new contact; bounded correction cannot teleport an
    // idle actor or push it through static geometry.
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
      const a=actors[i],b=actors[j],combined=radii[i]+radii[j];
      if(!sameSpace(a,b))continue;
      const dx=a.x-b.x,dz=a.z-b.z;
      if(Math.abs(dx)>=combined||Math.abs(dz)>=combined)continue;
      const d=Math.hypot(dx,dz);
      if(d>=combined-.001)continue;
      const correction=Math.min((combined-d+.001)*.5,dt*1.6),nx=d>.0001?dx/d:1,nz=d>.0001?dz/d:0;
      for(const [actor,sign] of [[a,1],[b,-1]] as const){
        const amount=Math.min(correction,budgets.get(actor)??0);if(amount<=0)continue;
        const next=this.collisionFor(actor).resolve(actor,{x:nx*amount*sign,z:nz*amount*sign},'uid' in actor?this.monsterRadius(actor):.46);
        budgets.set(actor,Math.max(0,(budgets.get(actor)??0)-distance(actor,next)));
        const b=this.boundsFor(actor);actor.x=Math.max(b[0],Math.min(b[2],next.x));actor.z=Math.max(b[1],Math.min(b[3],next.z));
      }
    }
  }
  private lineOfSight(a:Position,b:Position):boolean {
    if(!sameSpace(a,b))return false;
    const terrain=this.terrainFor(a);
    const height=(p:Position)=>{const m=this.state.monsters.find(m=>m===p);return m?Math.min(1.4,(m.id==='big'?4.6:m.id==='mini'?3.4:m.id==='bat'?1.4:1.9)*.65):1.3325;};
    const start={...a,y:terrain.supportAt(a.x,a.z)+height(a)};const end={...b,y:terrain.supportAt(b.x,b.z)+height(b)};
    if(!this.collisionFor(a).hasLineOfSight(start,end,.04))return false;
    const length=Math.hypot(start.x-end.x,start.y-end.y,start.z-end.z);
    for(let d=.4;d<length;d+=.4){const t=d/length;const x=start.x+(end.x-start.x)*t,z=start.z+(end.z-start.z)*t,y=start.y+(end.y-start.y)*t;if(y<terrain.heightAt(x,z)+.06)return false;}return true;
  }
  private monsterRadius(m:WorldMonster):number{return [CAVE_BOSS_ID,'rift_boss'].includes(m.id)?1.5:m.id.includes('golem')?1:m.id==='big'?1.2:m.id==='mini'?.9:.42;}
  private bodyRadius(actor:Position):number {const m=('uid' in actor&&'id' in actor&&Object.hasOwn(MONSTERS,String(actor.id)))?actor as WorldMonster:undefined;return m?[CAVE_BOSS_ID,'rift_boss'].includes(m.id)?1.65:m.id.includes('golem')?1.05:m.id==='big'?1.4:m.id==='mini'?2.05:m.id==='wolf'?1.615:.46:.46;}
  private monsterRange(m:WorldMonster):number{if(m.id===CAVE_BOSS_ID)return classAttackRange('ranger');return Math.max(1.65,this.bodyRadius(m)+.64);}
  private relocate(p:WorldCharacter,point:Position):void {
    const free=this.collisionFor(point).findNearestFree(point,.46);
    if(this.collisionFor(point).isBlocked(free,.46))throw Error('no-free-arrival');
    this.tradeSessions.delete(p.id);
    this.cancelControl(p);this.motor(p).reset();this.paths.delete(p.id);this.pursuit.delete(p.id);this.approaching.delete(p.id);
    // Destination metadata (notably its required level) is never character data.
    Object.assign(p,{x:free.x,z:free.z,...(this.finalWorld?{spaceId:spaceOf(point)}:{})},motion(this.state.time),{generation:p.generation+1});
  }
  private motor(p:WorldCharacter):CharacterMotor {let motor=this.motors.get(p.id);if(!motor){motor=new CharacterMotor();this.motors.set(p.id,motor);}return motor;}
  private action(actor:WorldMotion,action:WorldMotion['action'],endsAt=0):void {if(actor.action!==action||action==='attack'){actor.action=action;actor.actionStartedAt=this.state.time;actor.actionEndsAt=endsAt;}}
  private cancelAttack(id:string):void {
    if(this.state.pending.some(a=>a.actor===id)){this.state.pending=this.state.pending.filter(a=>a.actor!==id);this.event('cancel',id);}
    const actor=this.state.characters[id]??this.state.monsters.find(m=>m.uid===id)??this.state.summons.find(m=>m.uid===id);if(actor?.action==='attack')this.action(actor,'idle');
    const p=this.state.characters[id];if(p)p.bufferedSkill=undefined;
  }
  private cancelControl(p:WorldCharacter,stopPlanar=true,preserveAuto=false):void {
    const retain=preserveAuto&&p.autoAttack;p.target=retain?p.target:null;p.skill=null;p.autoAttack=Boolean(retain);p.singleAttack=false;p.bufferedSkill=undefined;p.destination=null;p.direction={x:0,z:0};this.cancelAttack(p.id);this.paths.delete(p.id);this.firingPositions.delete(p.id);this.approaching.delete(p.id);this.pursuit.delete(p.id);
    if(stopPlanar)this.motor(p).stopPlanar();
    p.combatState=p.dead?'dead':'idle';
  }
  private recalculate(p:WorldCharacter):void {
    Object.assign(p,calculateEquipmentStats(p.classId,CLASSES[p.classId as ClassId].stats,p.level,p.equipment,itemDef));
    this.books.modifyStats(p);
    if((p.buffs.haste??0)>this.state.time){p.stats.speed*=1.5;p.stats.attackInterval!/=1.15;}
    p.stats.manaRegen=manaRegenerationPerSecond(p.classId,p.maxMp,p.stats);
    p.hp=Math.min(p.hp,p.maxHp);p.mp=Math.min(p.mp,p.maxMp);
  }
  private migrateEquipment(p:WorldCharacter):void {
    for(const [slot,item] of Object.entries(p.equipment)){if(!item)continue;const def=itemDef(item);if(def.classes&&!def.classes.includes(p.classId)){delete p.equipment[slot];if(p.inventory.length<42)p.inventory.push(item);else p.lootBuffer.push(item);}}
  }
  private migrateAccessories(p:WorldCharacter):void {
    const result=migrateAccessories(p,item=>Object.hasOwn(ITEMS,item.id)?itemDef(item):undefined);
    if(result.backup){
      this.state.accessoryMigrationBackups??={};
      this.state.accessoryMigrationBackups[p.id]??={at:this.state.time,version:ACCESSORY_MIGRATION_VERSION,items:result.backup};
      Object.assign(p,result.state);
    }
  }
  private validateCraftPosition(p:WorldCharacter):void {
    if(p.dead||p.hp<=0)throw Error('dead');
    if(p.activeUntil<=this.state.time)throw Error('craft-inactive');
    if(!p.grounded||p.destination||Math.hypot(p.direction.x,p.direction.z)>0.01||Math.hypot(p.velocityX??0,p.velocityZ??0)>0.01)throw Error('craft-must-stand-still');
    if(p.target||p.autoAttack||p.singleAttack||p.skill!==null||(p.hitUntil??0)>this.state.time||
      this.state.pending.some(a=>a.actor===p.id||a.target===p.id||a.owner===p.id)||this.state.projectiles?.some(a=>a.actor===p.id)||
      this.state.monsters.some(m=>m.alive&&sameSpace(m,p)&&(m.targetId===p.id||m.provokedBy===p.id||
        !this.safe(p)&&distance(m,p)<(this.finalWorld?.slotById.get(m.uid)?.aggroRadius??SPAWN_REGIONS.find(r=>r.id===m.regionId)?.aggroRadius??('boss' in monsterDef(m)?11:9))&&this.lineOfSight(p,m))))throw Error('craft-in-combat');
  }
  private addInventoryItem(p:WorldCharacter,item:InventoryItem):'stacked'|'added'|'full' {
    const def=itemDef(item);return addOrStackItem(p.inventory,item,Boolean(def)&&!def.slot&&def.maxStack!==1,42,def?.maxStack??Number.MAX_SAFE_INTEGER);
  }
  private addItem(p:WorldCharacter,id:string):void {const item=this.item(id);if(this.addInventoryItem(p,item)==='full')p.lootBuffer.push(item);}
  private item(id:string,count=1):InventoryItem {if(!Object.hasOwn(ITEMS,id))throw Error('unknown-item');return {id,uid:this.identifier(),plus:0,count};}
  private character(id:string):WorldCharacter {const p=this.state.characters[id];if(!p)throw Error('unknown-character');return p;}
  private event(kind:WorldEvent['kind'],actor:string,target?:string,extra:Partial<WorldEvent>={}):void {
    const entity=this.state.characters[actor]??this.state.monsters.find(m=>m.uid===actor)??this.state.summons.find(m=>m.uid===actor);
    this.events.push({kind,actor,target,spaceId:entity?spaceOf(entity):undefined,...extra,at:this.state.time,sequence:++this.state.sequence});if(this.events.length>256)this.events.shift();
  }
}
