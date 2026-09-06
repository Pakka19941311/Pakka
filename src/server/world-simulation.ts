import { CLASSES, ITEMS, MONSTERS } from '../data/game-data.ts';
import { calculateEquipmentStats } from '../core/equipment-stats.ts';
import type { ItemStatDefinition } from '../core/equipment-stats.ts';
import { grantBetaScrolls } from '../core/beta-scrolls.ts';
import { enhanceItem, rollScrollDrops } from '../core/enhancement-v2.ts';
import { equipInventoryItem, unequipInventoryItem, reorderInventoryItem } from '../core/inventory-commands.ts';
import type { InventoryItem } from '../core/inventory-commands.ts';
import { addOrStackItem, applyExperience } from '../core/gameplay-session.ts';
import { bossRespawnSeconds, classAttackRange, classCombatProfile, monsterMovementSpeed } from '../core/game-rules.ts';
import { resolveAttackAccuracy } from '../core/attack-accuracy.ts';
import { CollisionWorld } from '../world/collision-world.ts';
import { SPAWN_REGIONS, spawnPointInRegion, patrolRouteInRegion } from '../world/spawn-regions.ts';
import { findNavigationPath } from '../world/navigation.ts';
import { TerrainSurface } from '../world/terrain-surface.ts';
import { CharacterMotor, smoothAngle } from '../controls/character-motor.ts';
import { slidePastActor } from '../controls/actor-spacing.ts';
import { resolveChainLightning } from '../combat/chain-lightning.ts';
import { MonsterAiBrain } from '../world/monster-ai.ts';
import { WORLD_PROTOCOL, DISCONNECT_GRACE_MS } from '../network/world-protocol.ts';
import { parseBetaSave } from './beta-import.ts';
import type { WorldCharacter, WorldMonster, WorldSummon, WorldCommand, WorldIntent, WorldEvent, WorldSnapshot, CommandReceipt, Position, WorldMotion } from '../network/world-protocol.ts';

type ClassId = keyof typeof CLASSES;
type ItemId = keyof typeof ITEMS;
type MonsterId = keyof typeof MONSTERS;
type Skill = { cost: number; cd: number; mul?: number; fx: string; buff?: string; summon?: boolean; chain?: number; chainRadius?: number; chainFalloff?: number; aoe?: number; stun?: number; slow?: number; dot?: number; knock?: number; leech?: number };
type PendingAttack = {
  actor:string; target:string; generation:number; actorGeneration?:number;
  hitAt:number; endsAt?:number; skill:number|null; monster:boolean; released?:boolean;
  damage?:number; critical?:boolean; accuracy?:number;
};
type Projectile = {actor:string;target:string;generation:number;actorGeneration:number;skill:number|null;damage:number;critical:boolean;accuracy:number;startedAt:number;endsAt:number;origin:Position & {y:number};point:Position & {y:number}};
// Attack clip lengths measured from the shipped glTF accessors. The contact
// phases and duration cap are exactly ActorAnimation.beginAttack's contract.
const ATTACK_CLIPS:Record<string,number>={Warrior:20/24,Wizard:29/24,Ranger:15/24,Rogue:18/24,Monk:20/24,Fox:.8,Skeleton:22/24,Slime:15/24,Dragon:21/24,Bat:21/24};
const motion=(now:number):WorldMotion=>({yOffset:0,grounded:true,yaw:0,action:'idle',actionStartedAt:now,actionEndsAt:0});
function attackTimings(model:string,maximum=Infinity){const duration=Math.max(.35,Math.min(ATTACK_CLIPS[model]??.8,maximum));const contact=model==='Warrior'?.5:model==='Wizard'?.56:model==='Ranger'?.48:.42;return {windup:duration*contact*1000,duration:duration*1000};}
export type PersistedWorld = {
  schema: 1; time: number; revision: number; sequence: number;
  characters: Record<string, WorldCharacter>; monsters: WorldMonster[]; summons: WorldSummon[];
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
const SPAWN = { x: -7, z: -11 };
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
const safe = (p: Position) => Math.hypot(p.x + 7, p.z + 5) < 20.5 || Math.hypot(p.x + 108, p.z + 82) < 16;
const itemDef = (item: InventoryItem): ItemStatDefinition & {slot?:string} => ITEMS[item.id as ItemId] as ItemStatDefinition & {slot?:string};
const monsterDef = (m: WorldMonster) => MONSTERS[m.id as MonsterId];
const npcPositions = { shop: {x:.3,z:-7.8}, elder: {x:-7,z:-2.6}, teleport: {x:-7,z:-20} };
const teleportPoints: Record<string, {x:number;z:number;cost:number;level:number}> = {
  'Астерхолд': {x:-108,z:-82,cost:0,level:1}, 'Гринфолл': {...SPAWN,cost:25,level:1},
  'Чёрный лес': {x:94,z:44,cost:90,level:10}, 'Вход в шахту': {x:132,z:94,cost:150,level:10},
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
  private readonly terrain: TerrainSurface;
  private lastCheckpoint: number;
  private paths = new Map<string, { goal: Position; points: Position[]; expiresAt: number }>();
  private brains = new Map<string,MonsterAiBrain>();
  private motors=new Map<string,CharacterMotor>();
  private approaching=new Set<string>();
  private pursuit=new Map<string,{x:number;z:number;since:number}>();

  constructor(options: {store: SimulationStore; collision: CollisionWorld; terrain?: TerrainSurface; now: number; random?: () => number; identifier: () => string; beta?: boolean}) {
    this.store = options.store; this.collision = options.collision;
    this.terrain = options.terrain ?? new TerrainSurface();
    this.random = options.random ?? Math.random; this.identifier = options.identifier; this.beta = Boolean(options.beta);
    this.state = this.store.load() ?? {schema:1,time:options.now,revision:0,sequence:0,characters:{},monsters:[],summons:[],pending:[]};
    if (this.state.schema !== 1) throw Error('unsupported-world-schema');
    this.state.projectiles??=[];
    for(const actor of [...Object.values(this.state.characters),...this.state.monsters,...this.state.summons])Object.assign(actor,{...motion(this.state.time),...actor});
    this.lastCheckpoint = this.state.time;
    if (!this.state.monsters.length) for (const region of SPAWN_REGIONS) {
      for (let i=0;i<region.population;i++) this.spawnMonster(region.monsterId, spawnPointInRegion(region,i), `${region.id}:${i}`,region.id,i);
    }
    // A process restart breaks all connections. Never renew their exposure deadline.
    for (const p of Object.values(this.state.characters)) {
      p.activeUntil = Math.min(p.activeUntil, this.state.time + DISCONNECT_GRACE_MS);
      p.direction = {x:0,z:0};p.destination=null;p.target=null;p.skill=null;p.bufferedSkill=undefined;p.autoAttack=false;
      p.yOffset=0;p.grounded=true;p.action=p.dead?'death':'idle';
    }
    // Process restarts cancel unfinished windups; already released projectiles
    // remain server-owned and retain their generation checks.
    this.state.pending=this.state.pending.filter(a=>a.monster);
    this.advance(options.now);
    this.store.save(this.state);
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
    p.equipment=Object.fromEntries(Object.entries(p.equipment).map(([slot,item])=>[slot,item?remap(item):undefined]));
    const granted=grantBetaScrolls({player:p,lootBuffer:p.lootBuffer,betaScrollGrant:p.betaScrollGrant},id=>this.item(id));
    p={...granted.player,lootBuffer:granted.lootBuffer,betaScrollGrant:granted.betaScrollGrant};
    this.recalculate(p);if(p.dead){p.hp=0;p.action='death';}
    Object.assign(p,this.collision.findNearestFree(p,.46));
    this.state.characters[p.id]=p;
    try { this.store.commitImport(this.state,p.id,importId,raw,this.state.time); }
    catch(error){delete this.state.characters[p.id];throw error;}
    return p;
  }

  private prepareCharacter(name: string, classId: string): WorldCharacter {
    if (!Object.hasOwn(CLASSES,classId) || typeof name !== 'string') throw Error('invalid-character');
    const cls = CLASSES[classId as ClassId];
    const equipment = {weapon:this.item(cls.weapon),chest:this.item(cls.armor)};
    const calculated = calculateEquipmentStats(classId,cls.stats,1,equipment,itemDef);
    let p: WorldCharacter = {
      ...SPAWN, ...calculated, ...motion(this.state.time), id:this.identifier(),name:name.trim().slice(0,24)||'Странник',classId,
      level:1,xp:0,gold:320,hp:calculated.maxHp,mp:calculated.maxMp,
      inventory:[this.item('potion',6),this.item('ether',4),this.item('teleport')],equipment,
      lootBuffer:[],quest:0,kills:0,bossKills:0,dead:false,cooldowns:[0,0,0,0],attackReadyAt:0,
      buffs:{guard:0,vanish:0},activeUntil:0,lastInputSequence:-1,lastInputAt:0,
      direction:{x:0,z:0},destination:null,target:null,skill:null,generation:1,
    };
    if (this.beta) {
      const granted = grantBetaScrolls({player:p,lootBuffer:p.lootBuffer,betaScrollGrant:p.betaScrollGrant}, id=>this.item(id));
      p = {...granted.player,lootBuffer:granted.lootBuffer,betaScrollGrant:granted.betaScrollGrant};
    }
    return p;
  }

  heartbeat(id: string): void { this.character(id).activeUntil = this.state.time + DISCONNECT_GRACE_MS; }
  disconnect(id: string): void {
    const p = this.character(id);
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
      if (intent.type==='destination' && (Math.abs(intent.x)>156 || Math.abs(intent.z)>136)) throw Error('outside-world');
    }
    p.lastInputSequence=sequence;p.lastInputAt=this.state.time;
    if(intent.type==='jump'){
      if(this.motor(p).requestJump()){const direction=p.direction;this.cancelControl(p,false);p.direction=direction;p.grounded=false;this.action(p,'jump');}return;
    }
    if(intent.type==='direction'){
      const length=Math.max(1,Math.hypot(intent.x,intent.z));
      if(Math.hypot(intent.x,intent.z)>.01)this.cancelControl(p,false);
      p.direction={x:intent.x/length,z:intent.z/length};return;
    }
    if(intent.type==='destination'){
      this.cancelControl(p,false);p.destination=this.collision.findNearestFree({x:intent.x,z:intent.z},.46);return;
    }
    if(intent.type==='cancel'){this.cancelControl(p);return;}
    if(intent.skill!==null&&(!Number.isInteger(intent.skill)||intent.skill<0||intent.skill>3))throw Error('invalid-skill');
    const skill=intent.skill===null?undefined:CLASSES[p.classId as ClassId].skills[intent.skill] as Skill;
    const self=Boolean(skill?.buff||skill?.summon);
    const target=self?undefined:this.state.monsters.find(m=>m.uid===intent.entityId&&m.alive);
    if(!self&&!target)throw Error('missing-target');
    if(skill&&(!p.grounded||p.mp<skill.cost))throw Error(!p.grounded?'airborne':'insufficient-resource');
    const active=this.state.pending.find(a=>a.actor===p.id);
    if(active&&skill){
      const remaining=(active.endsAt??active.hitAt)-this.state.time;
      if(!active.released||remaining>350||p.cooldowns[intent.skill!]>this.state.time+remaining)throw Error('attack-in-progress');
      p.bufferedSkill={target:self?'@self':target!.uid,index:intent.skill!,expiresAt:this.state.time+350};return;
    }
    if(skill&&p.cooldowns[intent.skill!]>this.state.time)throw Error('skill-cooldown');
    if(self){this.selfSkill(p,intent.skill!,skill!);return;}
    if(active&&p.target!==target!.uid)this.cancelAttack(p.id);
    p.target=target!.uid;p.skill=intent.skill;p.destination=null;p.direction={x:0,z:0};p.bufferedSkill=undefined;
    if(intent.skill===null)p.autoAttack=true;
    this.approaching.delete(p.id);this.pursuit.delete(p.id);
  }

  command(id: string, commandId: string, command: WorldCommand): CommandReceipt {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandId)) throw Error('invalid-command-id');
    this.character(id);
    const previous=this.store.receipt(id,commandId,command);
    if (previous) return previous;
    const before=structuredClone(this.state);const eventsBefore=[...this.events];
    let receipt: CommandReceipt;
    try {
      const outcome=this.applyCommand(this.character(id),command);
      receipt={id:commandId,ok:true,at:this.state.time,...(outcome===undefined?{}:{outcome})};
    } catch (error) {
      this.state=before;this.events.splice(0,this.events.length,...eventsBefore);
      receipt={id:commandId,ok:false,at:this.state.time,reason:error instanceof Error?error.message:'invalid-command'};
    }
    this.state.revision++;
    try {this.store.commit(this.state,id,commandId,command,receipt);}
    catch (error) {this.state=before;this.events.splice(0,this.events.length,...eventsBefore);throw error;}
    return receipt;
  }

  private applyCommand(p: WorldCharacter, command: WorldCommand): unknown {
    if (command.type==='respawn') {
      if (!p.dead) throw Error('not-dead');
      this.cancelControl(p);Object.assign(p,SPAWN,motion(this.state.time),{dead:false,hp:p.maxHp,mp:p.maxMp,target:null,destination:null,direction:{x:0,z:0},generation:p.generation+1});
      return;
    }
    if (p.dead) throw Error('dead');
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
      if (item.id==='potion' && p.hp<p.maxHp) p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*.45));
      else if(item.id==='ether' && p.mp<p.maxMp) p.mp=Math.min(p.maxMp,p.mp+Math.round(p.maxMp*.45));
      else if(item.id==='teleport') {Object.assign(p,SPAWN);this.cancelControl(p);}
      else throw Error('cannot-use');
      if (--item.count===0) p.inventory=p.inventory.filter(i=>i.uid!==item.uid);
      return;
    }
    if(command.type==='sell'){
      const item=p.inventory.find(i=>i.uid===command.item.uid);
      if(!item||item.id!==command.item.id||item.plus!==command.item.plus||item.count!==command.item.count)throw Error('stale-item');
      p.gold+=Math.floor(ITEMS[item.id as ItemId].value*.48)*item.count;p.inventory=p.inventory.filter(i=>i.uid!==item.uid);return;
    }
    if (command.type==='buy') {
      const cost: Record<string,number>={potion:55,ether:70,teleport:130};
      if (!Object.hasOwn(cost,command.itemId) || distance(p,npcPositions.shop)>3.2) throw Error('shop-unavailable');
      if (p.gold<cost[command.itemId]) throw Error('insufficient-gold');
      p.gold-=cost[command.itemId];this.addItem(p,command.itemId);return;
    }
    if (command.type==='teleport') {
      const point=teleportPoints[command.destination];
      if (!point||distance(p,npcPositions.teleport)>3.2) throw Error('teleport-unavailable');
      if (p.level<point.level) throw Error('level-required');
      if (p.gold<point.cost) throw Error('insufficient-gold');
      p.gold-=point.cost;p.x=point.x;p.z=point.z;this.cancelControl(p);return;
    }
    if (command.type==='collect') {
      const retained: InventoryItem[]=[];
      for(const item of p.lootBuffer) if(addOrStackItem(p.inventory,item,!('slot' in itemDef(item)))==='full') retained.push(item);
      p.lootBuffer=retained;return;
    }
    if (command.type==='quest') {
      if(distance(p,npcPositions.elder)>3.2)throw Error('elder-unavailable');
      p.quest=Math.max(1,p.quest);
      return;
    }
    throw Error('unknown-command');
  }

  advance(now: number): void {
    if (!Number.isFinite(now)||now<this.state.time) return;
    // Active characters have at most 30 seconds of exposure after a disconnected
    // process. Beyond that, only saved absolute deadlines need offline catch-up.
    const maxActive=Math.max(this.state.time,...Object.values(this.state.characters).map(p=>p.activeUntil));
    const simulatedUntil=Math.min(now,Math.max(this.state.time+1000,maxActive));
    while(this.state.time<simulatedUntil){
      const dt=Math.min(50,simulatedUntil-this.state.time);this.state.time+=dt;this.tick(dt/1000);
    }
    if(this.state.time<now){this.state.time=now;this.expireDeadlines();}
    this.state.revision++;
    if(now-this.lastCheckpoint>=1000){this.store.save(this.state);this.lastCheckpoint=now;}
  }
  checkpoint(): void {this.store.save(this.state);this.lastCheckpoint=this.state.time;}
  snapshot(id: string, afterEvent=0): WorldSnapshot {
    const character=this.character(id);
    return structuredClone({protocol:WORLD_PROTOCOL,time:this.state.time,revision:this.state.revision,character,
      heroes:Object.values(this.state.characters).filter(p=>p.activeUntil>this.state.time).map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,dead:p.dead,equipment:p.equipment,generation:p.generation,yOffset:p.yOffset,grounded:p.grounded,yaw:p.yaw,action:p.action,actionStartedAt:p.actionStartedAt,actionEndsAt:p.actionEndsAt})),
      monsters:this.state.monsters,summons:this.state.summons,events:this.events.filter(e=>e.sequence>afterEvent)});
  }
  private tick(dt: number): void {
    this.expireDeadlines();
    for(const p of Object.values(this.state.characters)){
      if(p.activeUntil<=this.state.time||p.dead){this.cancelAttack(p.id);continue;}
      p.mp=Math.min(p.maxMp,p.mp+p.maxMp*.022*dt);
      if(this.state.time-p.lastInputAt>500)p.direction={x:0,z:0};
      let active=this.state.pending.find(a=>a.actor===p.id);
      if(active&&!this.validAttack(active)){this.cancelAttack(p.id);active=undefined;}
      const motor=this.motor(p);
      let direction:Position={x:0,z:0},limit=Infinity;
      if(Math.hypot(p.direction.x,p.direction.z)>.01){direction=p.direction;}
      else if(!active){
        if(p.bufferedSkill&&p.bufferedSkill.expiresAt<=this.state.time)p.bufferedSkill=undefined;
        const target=this.state.monsters.find(m=>m.uid===p.target&&m.alive);
        if(p.target&&!target){p.target=null;p.skill=null;p.autoAttack=false;}
        let goal=p.destination;
        if(target&&(p.autoAttack||p.skill!==null)){
          const skill=p.skill===null?undefined:CLASSES[p.classId as ClassId].skills[p.skill] as Skill;
          if(skill&&(p.mp<skill.cost||p.cooldowns[p.skill!]>this.state.time))p.skill=null;
          const range=this.lineOfSight(p,target)?classAttackRange(p.classId):.1;
          const d=distance(p,target);if(d>range)this.approaching.add(p.id);
          if(d>(this.approaching.has(p.id)?range*.9:range)){
            const travel=Math.max(0,d-Math.max(.35,range*.78));goal={x:p.x+(target.x-p.x)/Math.max(.001,d)*travel,z:p.z+(target.z-p.z)/Math.max(.001,d)*travel};
          }else{
            this.approaching.delete(p.id);motor.stopPlanar();p.yaw=smoothAngle(p.yaw,Math.atan2(target.x-p.x,target.z-p.z),9,dt);
            if(p.grounded&&(p.skill!==null||p.attackReadyAt<=this.state.time)&&Math.cos(Math.atan2(target.x-p.x,target.z-p.z)-p.yaw)>.97)this.beginPlayerAttack(p,target);
          }
        }
        if(goal){
          if(distance(p,goal)<.18){if(p.destination)p.destination=null;this.pursuit.delete(p.id);}
          else{
            const progress=this.pursuit.get(p.id);
            if(!progress||distance(p,progress)>.2)this.pursuit.set(p.id,{x:p.x,z:p.z,since:this.state.time});
            else if(this.state.time-progress.since>=2500){this.cancelControl(p);this.event('cancel',p.id,undefined,{reason:'no-free-path'});goal=null;}
            if(goal){const point=this.waypoint(p,goal,.46,p.id);if(point){direction={x:point.x-p.x,z:point.z-p.z};limit=distance(p,point);}}
          }
        }else this.pursuit.delete(p.id);
      }
      const step=motor.step(direction,p.stats.speed,dt,limit);
      this.move(p,{x:step.dx,z:step.dz},1,.46);p.yOffset=step.height;p.grounded=step.grounded;
      if(!step.grounded)this.action(p,'jump');
      else if(Math.hypot(step.dx,step.dz)>.001){p.yaw=smoothAngle(p.yaw,Math.atan2(step.facingX,step.facingZ),16,dt);this.action(p,'walk');}
      else if(p.action==='walk'||p.action==='jump')this.action(p,'idle');
    }
    for(const m of this.state.monsters)if(m.alive)this.monsterTick(m,dt);
    for(const attack of [...this.state.pending]){
      if(!this.state.pending.includes(attack))continue;
      if(!this.validAttack(attack)){this.cancelAttack(attack.actor);continue;}
      if(!attack.released&&attack.hitAt<=this.state.time){attack.released=true;this.resolveAttack(attack);}
      if(this.state.pending.includes(attack)&&(attack.endsAt??attack.hitAt)<=this.state.time){
        this.state.pending=this.state.pending.filter(a=>a!==attack);
        const p=this.state.characters[attack.actor];const actor=p??this.state.monsters.find(m=>m.uid===attack.actor);
        if(actor)this.action(actor,'idle');
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
  }
  private expireDeadlines(): void {
    for(const m of this.state.monsters) if(!m.alive&&m.respawnAt<=this.state.time){
      Object.assign(m,{...motion(this.state.time),...m.home,hp:monsterDef(m).hp,alive:true,attackReadyAt:this.state.time+(250+this.random()*550),phase:1,generation:m.generation+1,status:{slow:0,stun:0,dot:0,nextDot:0},owner:undefined});
      this.brains.delete(m.uid);
      this.event('respawn',m.uid);
    }
    this.state.summons=this.state.summons.filter(s=>s.expiresAt>this.state.time);
  }
  private beginPlayerAttack(p:WorldCharacter,target:WorldMonster):void {
    const skill=p.skill===null?undefined:CLASSES[p.classId as ClassId].skills[p.skill] as Skill;
    if(skill&&(p.mp<skill.cost||p.cooldowns[p.skill!]>this.state.time)){p.skill=null;return;}
    const cls=CLASSES[p.classId as ClassId];const profile=classCombatProfile(p.classId,p.level,p.stats);
    p.attackReadyAt=Math.max(p.attackReadyAt,this.state.time+profile.attackInterval*1000);
    const timing=attackTimings(cls.model,(p.attackReadyAt-this.state.time)/1000*.92);
    const base=p.classId==='mage'||p.classId==='necro'?p.stats.matk:p.stats.atkMin+this.random()*(p.stats.atkMax-p.stats.atkMin);
    const critical=this.random()<p.stats.crit/100;
    const damage=Math.max(1,Math.round(base*(skill?.mul??1)*(critical?profile.critMultiplier:1)));
    const attack:PendingAttack={actor:p.id,target:target.uid,generation:target.generation,actorGeneration:p.generation,
      hitAt:this.state.time+timing.windup,endsAt:this.state.time+timing.duration,skill:p.skill,monster:false,damage,critical,accuracy:p.stats.accuracy};
    this.state.pending.push(attack);this.motor(p).stopPlanar();this.action(p,'attack',attack.endsAt);
    this.event('attack',p.id,target.uid,{skill:p.skill,generation:target.generation,impactAt:attack.hitAt,endsAt:attack.endsAt});p.skill=null;
  }
  private validAttack(a:PendingAttack):boolean {
    if(a.monster){const m=this.state.monsters.find(m=>m.uid===a.actor&&m.alive);const p=this.state.characters[a.target];
      return Boolean(m&&p&&!p.dead&&p.generation===a.generation&&p.activeUntil>this.state.time&&!safe(p)&&p.buffs.vanish<=this.state.time&&m.status.stun<=this.state.time);}
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation);
    return Boolean(p&&!p.dead&&p.activeUntil>this.state.time&&p.generation===(a.actorGeneration??p.generation)&&target&&p.target===target.uid);
  }
  private resolveAttack(a:PendingAttack):void {
    if(a.monster){
      const m=this.state.monsters.find(m=>m.uid===a.actor&&m.alive)!;const p=this.state.characters[a.target];
      if(distance(m,p)>=this.monsterRange(m)+.25||!this.lineOfSight(m,p))return;
      const base=Math.max(1,Math.round(Math.round(monsterDef(m).atk*(1+(m.phase-1)*.32))-p.stats.def*.2));
      const amount=p.buffs.guard>this.state.time?Math.max(1,Math.round(base*.5)):base;
      p.hp=Math.max(0,p.hp-amount);this.event('hit',m.uid,p.id,{amount});
      if(!p.hp){p.dead=true;p.xp=Math.max(0,p.xp-Math.floor(p.xp*.05));this.cancelControl(p);this.action(p,'death');this.event('death',p.id);this.checkpoint();}return;
    }
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation)!;
    const cls=CLASSES[p.classId as ClassId];
    if(distance(p,target)>classAttackRange(p.classId)+(cls.ranged ? .05 : .25)||!this.lineOfSight(p,target)){this.cancelAttack(p.id);this.event('cancel',p.id,target.uid,{skill:a.skill,reason:'out-of-reach'});return;}
    const skill=a.skill===null?undefined:cls.skills[a.skill] as Skill;
    if(skill){
      if(p.mp<skill.cost||p.cooldowns[a.skill!]>this.state.time){this.cancelAttack(p.id);return;}
      p.mp-=skill.cost;p.cooldowns[a.skill!]=this.state.time+skill.cd*1000;
    }
    const effect=skill?.fx??(p.classId==='mage'||p.classId==='necro'?'fire':'arrow');
    this.event('release',p.id,target.uid,{skill:a.skill,generation:a.generation,effect:cls.ranged?effect:'slash',durationMs:cls.ranged&&effect!=='lightning'&&effect!=='slash'?280:0});
    const strike={actor:p.id,target:target.uid,generation:target.generation,actorGeneration:p.generation,skill:a.skill,damage:a.damage!,critical:Boolean(a.critical),accuracy:a.accuracy!};
    if(!cls.ranged||effect==='lightning'||effect==='slash')this.strike(strike);
    else{const origin={x:p.x,z:p.z,y:this.terrain.supportAt(p.x,p.z)+1.4};this.state.projectiles!.push({...strike,origin,point:{...origin},startedAt:this.state.time,endsAt:this.state.time+280});}
  }
  private projectileTick(projectile:Projectile):void {
    const target=this.state.monsters.find(m=>m.uid===projectile.target&&m.alive&&m.generation===projectile.generation);
    const remove=()=>{this.state.projectiles=this.state.projectiles!.filter(p=>p!==projectile);};
    if(!target){remove();return;}
    const t=Math.min(1,(this.state.time-projectile.startedAt)/280);
    const end={x:target.x,z:target.z,y:this.terrain.supportAt(target.x,target.z)+1.4};
    const next={x:projectile.origin.x+(end.x-projectile.origin.x)*t,z:projectile.origin.z+(end.z-projectile.origin.z)*t,y:projectile.origin.y+(end.y-projectile.origin.y)*t};
    if(!this.collision.hasLineOfSight(projectile.point,next,.025)||next.y<this.terrain.heightAt(next.x,next.z)+.04){remove();return;}
    projectile.point=next;if(this.state.time>=projectile.endsAt){remove();this.strike(projectile);}
  }
  private strike(a:Pick<Projectile,'actor'|'target'|'generation'|'actorGeneration'|'skill'|'damage'|'critical'|'accuracy'>):void {
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation);
    if(!p||!target)return;
    const skill=a.skill===null?undefined:CLASSES[p.classId as ClassId].skills[a.skill] as Skill;
    const hit=(m:WorldMonster,amount:number,critical=false)=>{
      if(!resolveAttackAccuracy(a.accuracy,this.random()).hit){this.event('miss',p.id,m.uid,{skill:a.skill,generation:m.generation});return false;}
      this.damage(m,amount,p,critical);return true;
    };
    let primary=false;
    if(skill?.chain){
      const hits=resolveChainLightning(target,this.state.monsters,{maxTargets:skill.chain,radius:skill.chainRadius??6.5,falloff:skill.chainFalloff??.76});
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
    const region=SPAWN_REGIONS.find(r=>r.id===m.regionId);
    const def=monsterDef(m);const radius=this.monsterRadius(m);const boss='boss' in def;
    if(m.status.dot>this.state.time&&this.random()<dt){const p=this.state.characters[m.status.dotOwner??''];if(p)this.damage(m,Math.max(2,Math.round(p.stats.matk*.08)),p,false);m.status.nextDot=this.state.time;}
    if(!m.alive)return;
    if(m.status.stun>this.state.time){this.cancelAttack(m.uid);this.action(m,'idle');return;}
    const candidates=Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time&&!safe(p)&&p.buffs.vanish<=this.state.time);
    const target=candidates.sort((a,b)=>distance(m,a)-distance(m,b))[0];
    const speed=monsterMovementSpeed(boss)*(m.status.slow>this.state.time?.45:1)*dt;
    let brain=this.brains.get(m.uid);
    if(!brain){brain=new MonsterAiBrain(m.home.x*.173+m.home.z*.127+m.patrolIndex*1.91);this.brains.set(m.uid,brain);}
    const points=region&&!region.boss?patrolRouteInRegion(region,m.home,m.patrolIndex):[];
    const point=points[(m.patrolStep??0)%Math.max(1,points.length)];
    const previous=brain.state;
    const decision=brain.update({dt,alive:true,playerSafe:false,targetAvailable:Boolean(target),
      playerDistance:target?distance(m,target):1000,homeDistance:distance(m,m.home),
      atPatrolPoint:!point||distance(m,point)<.55,aggroRadius:region?.aggroRadius??9,
      leashRadius:region?.leashRadius??14,attackRange:this.monsterRange(m)});
    if(previous!==decision.state&&decision.state==='patrol')m.patrolStep=(m.patrolStep??0)+1;
    if(decision.intent==='return'){
      this.cancelAttack(m.uid);this.walk(m,m.home,monsterMovementSpeed(boss)*dt*.9,radius,m.uid);return;
    }
    const active=this.state.pending.find(a=>a.actor===m.uid);
    if(active){if(this.validAttack(active)&&distance(m,m.home)<(region?.leashRadius??14)){if(target)m.yaw=smoothAngle(m.yaw,Math.atan2(target.x-m.x,target.z-m.z),9,dt);return;}this.cancelAttack(m.uid);}
    if(target&&(decision.intent==='chase'||decision.intent==='attack')){
      if(decision.intent==='chase'||!this.lineOfSight(m,target))this.walk(m,target,speed,radius,m.uid);
      else if(m.attackReadyAt<=this.state.time){
        m.attackReadyAt=this.state.time+(boss?1450:2050);
        const timing=attackTimings(def.model);const endsAt=this.state.time+timing.duration;const impactAt=this.state.time+timing.windup;
        this.state.pending.push({actor:m.uid,target:target.id,generation:target.generation,hitAt:impactAt,endsAt,skill:null,monster:true});
        this.action(m,'attack',endsAt);m.yaw=Math.atan2(target.x-m.x,target.z-m.z);this.event('attack',m.uid,target.id,{impactAt,endsAt});
      }
    }else if(decision.intent==='patrol'&&point){
      if(distance(m,point)>.55)this.walk(m,point,monsterMovementSpeed(boss)*dt*.46,radius,m.uid);
    }else this.action(m,'idle');
  }
  private selfSkill(p:WorldCharacter,index:number,skill:Skill):void {
    if(p.mp<skill.cost||p.cooldowns[index]>this.state.time)return;
    p.mp-=skill.cost;p.cooldowns[index]=this.state.time+skill.cd*1000;
    if(skill.buff==='guard')p.buffs.guard=this.state.time+7000;
    if(skill.buff==='vanish')p.buffs.vanish=this.state.time+4000;
    if(skill.summon){this.state.summons.push({...motion(this.state.time),...this.collision.findNearestFree({x:p.x+1.2,z:p.z+1.2},.42),uid:this.identifier(),owner:p.id,expiresAt:this.state.time+20000,attackReadyAt:0});this.event('summon',p.id);}
    else this.event('buff',p.id,undefined,{skill:index});
  }
  private summonTick(s:WorldSummon,dt:number):void {
    const p=this.state.characters[s.owner];if(!p||p.dead||p.activeUntil<=this.state.time){this.action(s,'idle');return;}
    const target=this.state.monsters.filter(m=>m.alive).sort((a,b)=>distance(s,a)-distance(s,b))[0];
    if(!target){this.action(s,'idle');return;}
    if(s.action==='attack'&&s.actionEndsAt<=this.state.time)this.action(s,'idle');
    if(distance(s,target)>1.8||!this.lineOfSight(s,target))this.walk(s,target,3.6*dt,.42,s.uid);
    else if(s.attackReadyAt<=this.state.time){s.attackReadyAt=this.state.time+1250;this.action(s,'attack',this.state.time+attackTimings('Skeleton').duration);s.yaw=Math.atan2(target.x-s.x,target.z-s.z);this.event('attack',s.uid,target.uid,{endsAt:s.actionEndsAt});this.damage(target,Math.max(5,Math.round(p.stats.matk*.3)),p,false);}
  }
  private damage(m:WorldMonster,amount:number,p:WorldCharacter,critical:boolean):void {
    if(!m.alive)return;m.hp=Math.max(0,m.hp-amount);m.owner??=p.id;this.event('hit',p.id,m.uid,{amount,critical});
    const def=monsterDef(m);
    if(m.id==='big'){
      const phase=m.hp/def.hp<=.3?3:m.hp/def.hp<=.65?2:1;
      if(phase>m.phase){m.phase=phase;for(let i=0;i<phase+1;i++){const a=i/(phase+1)*Math.PI*2;this.spawnMonster(phase===2?'wraith':'bat',{x:m.x+Math.cos(a)*4,z:m.z+Math.sin(a)*4},this.identifier());}}
    }
    if(m.hp===0){
      m.alive=false;m.respawnAt=this.state.time+('boss' in def?bossRespawnSeconds(def.boss as 'mini'|'big',this.random):28+this.random()*20)*1000;
      this.cancelAttack(m.uid);this.action(m,'death');this.event('death',m.uid);
      const owner=this.state.characters[m.owner]??p;owner.kills++;if('boss' in def)owner.bossKills++;
      const gained=applyExperience(owner.level,owner.xp,def.xp);owner.level=gained.level;owner.xp=gained.xp;
      if(gained.levelsGained){this.recalculate(owner);if(!owner.dead){owner.hp=owner.maxHp;owner.mp=owner.maxMp;}}
      owner.gold+=Math.floor(def.gold[0]+this.random()*(def.gold[1]-def.gold[0]+1));
      for(const [id,chance] of def.drops)if(id!=='scroll'&&this.random()<Number(chance))this.addItem(owner,String(id));
      for(const id of rollScrollDrops(m.id,this.random))this.addItem(owner,id);
      if(owner.quest===1&&owner.kills>=8)owner.quest=2;
      if(owner.quest===2&&m.id==='mini')owner.quest=3;
      if(owner.quest===3&&m.id==='big')owner.quest=4;
      this.event('loot',owner.id,m.uid);this.checkpoint();
    }
  }
  private spawnMonster(id:string,point:Position,uid:string,regionId?:string,index=0):void {
    const def=MONSTERS[id as MonsterId];const home=this.collision.findNearestFree(point,id==='big'?1.2:id==='mini'?.9:.42);
    this.state.monsters.push({...motion(this.state.time),...home,uid,id,home,regionId,patrolIndex:index,hp:def.hp,alive:true,respawnAt:0,attackReadyAt:this.state.time+this.random()*1000,generation:1,phase:1,status:{slow:0,stun:0,dot:0,nextDot:0}});
  }
  private waypoint(actor:Position,goal:Position,radius:number,key:string):Position|undefined {
    let path=this.paths.get(key);
    if(!path||path.expiresAt<=this.state.time||distance(path.goal,goal)>.7){
      path={goal:{...goal},points:findNavigationPath(this.collision,actor,goal,{actorRadius:radius,cellSize:.85,margin:24,maxVisited:4500}),expiresAt:this.state.time+650};this.paths.set(key,path);
    }
    while(path.points.length&&distance(actor,path.points[0])<.15)path.points.shift();return path.points[0];
  }
  private walk(actor:Position & WorldMotion,goal:Position,step:number,radius:number,key:string):void {
    const point=this.waypoint(actor,goal,radius,key);if(!point){this.action(actor,'idle');return;}
    const d=distance(actor,point);const before={x:actor.x,z:actor.z};
    this.move(actor,{x:(point.x-actor.x)/Math.max(.001,d),z:(point.z-actor.z)/Math.max(.001,d)},Math.min(d,step),radius);
    if(distance(before,actor)>.0001){actor.yaw=smoothAngle(actor.yaw,Math.atan2(point.x-before.x,point.z-before.z),9,.05);this.action(actor,'walk');}else this.action(actor,'idle');
  }
  private move(actor:Position,direction:Position,step:number,radius:number):void {
    let delta={x:direction.x*step,z:direction.z*step};
    const actorRadius=this.bodyRadius(actor);
    for(const other of [...Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time),...this.state.monsters.filter(m=>m.alive)]){
      if(other===actor)continue;const combined=actorRadius+this.bodyRadius(other);
      if(Math.abs(other.x-actor.x)>combined+Math.abs(delta.x)||Math.abs(other.z-actor.z)>combined+Math.abs(delta.z))continue;
      delta=slidePastActor(actor,delta,other,combined);
    }
    const moved=this.collision.resolve(actor,delta,radius);
    actor.x=Math.max(-156,Math.min(156,moved.x));actor.z=Math.max(-136,Math.min(136,moved.z));
  }
  private lineOfSight(a:Position,b:Position):boolean {
    const height=(p:Position)=>{const m=this.state.monsters.find(m=>m===p);return m?Math.min(1.4,(m.id==='big'?4.6:m.id==='mini'?3.4:m.id==='bat'?1.4:1.9)*.65):1.3325;};
    const start={...a,y:this.terrain.supportAt(a.x,a.z)+height(a)};const end={...b,y:this.terrain.supportAt(b.x,b.z)+height(b)};
    if(!this.collision.hasLineOfSight(start,end,.04))return false;
    const length=Math.hypot(start.x-end.x,start.y-end.y,start.z-end.z);
    for(let d=.4;d<length;d+=.4){const t=d/length;const x=start.x+(end.x-start.x)*t,z=start.z+(end.z-start.z)*t,y=start.y+(end.y-start.y)*t;if(y<this.terrain.heightAt(x,z)+.06)return false;}return true;
  }
  private monsterRadius(m:WorldMonster):number{return m.id==='big'?1.2:m.id==='mini'?.9:.42;}
  private bodyRadius(actor:Position):number {const m=this.state.monsters.find(m=>m===actor);return m?m.id==='big'?1.4:m.id==='mini'?2.05:m.id==='wolf'?1.615:.46:.46;}
  private monsterRange(m:WorldMonster):number{return Math.max(1.65,this.bodyRadius(m)+.64);}
  private motor(p:WorldCharacter):CharacterMotor {let motor=this.motors.get(p.id);if(!motor){motor=new CharacterMotor();this.motors.set(p.id,motor);}return motor;}
  private action(actor:WorldMotion,action:WorldMotion['action'],endsAt=0):void {if(actor.action!==action||action==='attack'){actor.action=action;actor.actionStartedAt=this.state.time;actor.actionEndsAt=endsAt;}}
  private cancelAttack(id:string):void {
    if(this.state.pending.some(a=>a.actor===id)){this.state.pending=this.state.pending.filter(a=>a.actor!==id);this.event('cancel',id);}
    const actor=this.state.characters[id]??this.state.monsters.find(m=>m.uid===id);if(actor?.action==='attack')this.action(actor,'idle');
    const p=this.state.characters[id];if(p)p.bufferedSkill=undefined;
  }
  private cancelControl(p:WorldCharacter,resetMotor=true):void {
    p.target=null;p.skill=null;p.autoAttack=false;p.bufferedSkill=undefined;p.destination=null;p.direction={x:0,z:0};this.cancelAttack(p.id);this.paths.delete(p.id);this.approaching.delete(p.id);this.pursuit.delete(p.id);
    if(resetMotor){this.motor(p).reset();p.yOffset=0;p.grounded=true;}
  }
  private recalculate(p:WorldCharacter):void {Object.assign(p,calculateEquipmentStats(p.classId,CLASSES[p.classId as ClassId].stats,p.level,p.equipment,itemDef));p.hp=Math.min(p.hp,p.maxHp);p.mp=Math.min(p.mp,p.maxMp);}
  private addItem(p:WorldCharacter,id:string):void {const item=this.item(id);if(addOrStackItem(p.inventory,item,!('slot' in itemDef(item)))==='full')p.lootBuffer.push(item);}
  private item(id:string,count=1):InventoryItem {if(!Object.hasOwn(ITEMS,id))throw Error('unknown-item');return {id,uid:this.identifier(),plus:0,count};}
  private character(id:string):WorldCharacter {const p=this.state.characters[id];if(!p)throw Error('unknown-character');return p;}
  private event(kind:WorldEvent['kind'],actor:string,target?:string,extra:Partial<WorldEvent>={}):void {
    this.events.push({kind,actor,target,...extra,at:this.state.time,sequence:++this.state.sequence});if(this.events.length>256)this.events.shift();
  }
}
