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
import { MonsterAiBrain } from '../world/monster-ai.ts';
import { WORLD_PROTOCOL, DISCONNECT_GRACE_MS } from '../network/world-protocol.ts';
import type { WorldCharacter, WorldMonster, WorldSummon, WorldCommand, WorldIntent, WorldEvent, WorldSnapshot, CommandReceipt, Position } from '../network/world-protocol.ts';

type ClassId = keyof typeof CLASSES;
type ItemId = keyof typeof ITEMS;
type MonsterId = keyof typeof MONSTERS;
type Skill = { cost: number; cd: number; mul?: number; fx: string; buff?: string; summon?: boolean; chain?: number; chainRadius?: number; chainFalloff?: number; aoe?: number; stun?: number; slow?: number; dot?: number; knock?: number; leech?: number };
type PendingAttack = { actor: string; target: string; generation: number; hitAt: number; skill: number | null; monster: boolean };
export type PersistedWorld = {
  schema: 1; time: number; revision: number; sequence: number;
  characters: Record<string, WorldCharacter>; monsters: WorldMonster[]; summons: WorldSummon[];
  pending: PendingAttack[];
};
export interface SimulationStore {
  load(): PersistedWorld | null;
  save(state: PersistedWorld): void;
  receipt(character: string, id: string, payload: WorldCommand): CommandReceipt | null;
  commit(state: PersistedWorld, character: string, id: string, payload: WorldCommand, result: CommandReceipt): void;
}
const SPAWN = { x: -7, z: -11 };
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
const safe = (p: Position) => Math.hypot(p.x + 7, p.z + 5) < 20 || Math.hypot(p.x + 108, p.z + 82) < 27;
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
  private readonly terrain = new TerrainSurface();
  private lastCheckpoint: number;
  private paths = new Map<string, { goal: Position; points: Position[]; expiresAt: number }>();
  private brains = new Map<string,MonsterAiBrain>();

  constructor(options: {store: SimulationStore; collision: CollisionWorld; now: number; random?: () => number; identifier: () => string; beta?: boolean}) {
    this.store = options.store; this.collision = options.collision;
    this.random = options.random ?? Math.random; this.identifier = options.identifier; this.beta = Boolean(options.beta);
    this.state = this.store.load() ?? {schema:1,time:options.now,revision:0,sequence:0,characters:{},monsters:[],summons:[],pending:[]};
    if (this.state.schema !== 1) throw Error('unsupported-world-schema');
    this.lastCheckpoint = this.state.time;
    if (!this.state.monsters.length) for (const region of SPAWN_REGIONS) {
      for (let i=0;i<region.population;i++) this.spawnMonster(region.monsterId, spawnPointInRegion(region,i), `${region.id}:${i}`,region.id,i);
    }
    // A process restart breaks all connections. Never renew their exposure deadline.
    for (const p of Object.values(this.state.characters)) {
      p.activeUntil = Math.min(p.activeUntil, this.state.time + DISCONNECT_GRACE_MS);
      p.direction = {x:0,z:0};
    }
    this.advance(options.now);
    this.store.save(this.state);
  }

  createCharacter(name: string, classId: string): WorldCharacter {
    if (!Object.hasOwn(CLASSES,classId) || typeof name !== 'string') throw Error('invalid-character');
    const cls = CLASSES[classId as ClassId];
    const equipment = {weapon:this.item(cls.weapon),chest:this.item(cls.armor)};
    const calculated = calculateEquipmentStats(classId,cls.stats,1,equipment,itemDef);
    let p: WorldCharacter = {
      ...SPAWN, ...calculated, id:this.identifier(),name:name.trim().slice(0,24)||'Странник',classId,
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
    this.state.characters[p.id] = p;
    try { this.store.save(this.state); } catch (error) { delete this.state.characters[p.id]; throw error; }
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
    if (!Number.isSafeInteger(sequence) || sequence <= p.lastInputSequence || p.dead) return;
    if (intent.type==='direction' || intent.type==='destination') {
      if (![intent.x,intent.z].every(Number.isFinite)) throw Error('invalid-position');
      if (intent.type==='destination' && (Math.abs(intent.x)>158 || Math.abs(intent.z)>138)) throw Error('outside-world');
    }
    p.lastInputSequence=sequence; p.lastInputAt=this.state.time;
    if (intent.type==='direction') {
      const length=Math.max(1,Math.hypot(intent.x,intent.z)); p.direction={x:intent.x/length,z:intent.z/length};
      if (Math.hypot(intent.x,intent.z)>.01) {this.cancelAttack(p.id);p.destination=null;p.target=null;p.skill=null;}
    } else if (intent.type==='destination') {
      this.cancelAttack(p.id);p.direction={x:0,z:0};p.destination={x:intent.x,z:intent.z};p.target=null;p.skill=null;
    } else if (intent.type==='cancel') {
      this.cancelAttack(p.id);p.direction={x:0,z:0};p.destination=null;p.target=null;p.skill=null;
    } else if (intent.type==='attack') {
      if (intent.skill!==null && (!Number.isInteger(intent.skill)||intent.skill<0||intent.skill>3)) throw Error('invalid-skill');
      const skill=intent.skill===null?undefined:CLASSES[p.classId as ClassId].skills[intent.skill] as Skill;
      if (skill?.buff||skill?.summon) {this.selfSkill(p,intent.skill!,skill);return;}
      const target=this.state.monsters.find(m=>m.uid===intent.entityId&&m.alive);
      if (!target) throw Error('missing-target');
      p.target=target.uid;p.skill=intent.skill;p.destination=null;p.direction={x:0,z:0};
    }
  }

  command(id: string, commandId: string, command: WorldCommand): CommandReceipt {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandId)) throw Error('invalid-command-id');
    this.character(id);
    const previous=this.store.receipt(id,commandId,command);
    if (previous) return previous;
    const before=structuredClone(this.state);
    let receipt: CommandReceipt;
    try {
      const outcome=this.applyCommand(this.character(id),command);
      receipt={id:commandId,ok:true,at:this.state.time,outcome};
    } catch (error) {
      this.state=before;
      receipt={id:commandId,ok:false,at:this.state.time,reason:error instanceof Error?error.message:'invalid-command'};
    }
    this.state.revision++;
    try {this.store.commit(this.state,id,commandId,command,receipt);}
    catch (error) {this.state=before;throw error;}
    return receipt;
  }

  private applyCommand(p: WorldCharacter, command: WorldCommand): unknown {
    if (command.type==='respawn') {
      if (!p.dead) throw Error('not-dead');
      Object.assign(p,SPAWN,{dead:false,hp:p.maxHp,mp:p.maxMp,target:null,destination:null,direction:{x:0,z:0},generation:p.generation+1});
      return;
    }
    if (p.dead) throw Error('dead');
    if (command.type==='equip' || command.type==='unequip' || command.type==='reorder') {
      const result=command.type==='equip'?equipInventoryItem(p,command.item,itemDef,command.slot)
        :command.type==='unequip'?unequipInventoryItem(p,command.item,command.slot):reorderInventoryItem(p,command.item,command.index);
      if (!result.ok) throw Error(result.reason);
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
    if (command.type==='buy') {
      const cost: Record<string,number>={potion:55,ether:70,teleport:130};
      if (!Object.hasOwn(cost,command.itemId) || distance(p,npcPositions.shop)>3.4) throw Error('shop-unavailable');
      if (p.gold<cost[command.itemId]) throw Error('insufficient-gold');
      p.gold-=cost[command.itemId];this.addItem(p,command.itemId);return;
    }
    if (command.type==='teleport') {
      const point=teleportPoints[command.destination];
      if (!point||distance(p,npcPositions.teleport)>3.4) throw Error('teleport-unavailable');
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
      if(distance(p,npcPositions.elder)>3.4)throw Error('elder-unavailable');
      if(p.quest===0){p.quest=1;p.kills=0;}else throw Error('quest-unavailable');
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
      heroes:Object.values(this.state.characters).filter(p=>p.activeUntil>this.state.time).map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,dead:p.dead,equipment:p.equipment,generation:p.generation})),
      monsters:this.state.monsters,summons:this.state.summons,events:this.events.filter(e=>e.sequence>afterEvent)});
  }
  private tick(dt: number): void {
    this.expireDeadlines();
    for (const p of Object.values(this.state.characters)) {
      if(p.activeUntil<=this.state.time||p.dead) continue;
      p.mp=Math.min(p.maxMp,p.mp+p.maxMp*.022*dt);
      if(this.state.time-p.lastInputAt>500) p.direction={x:0,z:0};
      if(this.state.pending.some(a=>a.actor===p.id)) continue;
      if(Math.hypot(p.direction.x,p.direction.z)>.01) this.move(p,p.direction,p.stats.speed*dt,.46);
      else if(p.destination){if(distance(p,p.destination)<.12)p.destination=null;else this.walk(p,p.destination,p.stats.speed*dt,.46,p.id);}
      else if(p.target){
        const target=this.state.monsters.find(m=>m.uid===p.target&&m.alive);
        if(!target){p.target=null;p.skill=null;continue;}
        const range=classAttackRange(p.classId);
        if(distance(p,target)>range||!this.lineOfSight(p,target))this.walk(p,target,p.stats.speed*dt,.46,p.id);
        else if(p.attackReadyAt<=this.state.time)this.beginPlayerAttack(p,target);
      }
    }
    for(const m of this.state.monsters) if(m.alive)this.monsterTick(m,dt);
    const due=this.state.pending.filter(a=>a.hitAt<=this.state.time);
    this.state.pending=this.state.pending.filter(a=>a.hitAt>this.state.time);
    for(const attack of due) this.resolveAttack(attack);
    for(const summon of this.state.summons)this.summonTick(summon,dt);
  }
  private expireDeadlines(): void {
    for(const m of this.state.monsters) if(!m.alive&&m.respawnAt<=this.state.time){
      Object.assign(m,{...m.home,hp:monsterDef(m).hp,alive:true,phase:1,generation:m.generation+1,status:{slow:0,stun:0,dot:0,nextDot:0},owner:undefined});
      this.brains.delete(m.uid);
      this.event('respawn',m.uid);
    }
    this.state.summons=this.state.summons.filter(s=>s.expiresAt>this.state.time);
  }
  private beginPlayerAttack(p: WorldCharacter,target: WorldMonster): void {
    const skill=p.skill===null?undefined:CLASSES[p.classId as ClassId].skills[p.skill] as Skill;
    if(skill&&(p.mp<skill.cost||p.cooldowns[p.skill!]>this.state.time)){p.skill=null;return;}
    if(skill){p.mp-=skill.cost;p.cooldowns[p.skill!]=this.state.time+skill.cd*1000;}
    const profile=classCombatProfile(p.classId,p.level,p.stats);
    p.attackReadyAt=this.state.time+profile.attackInterval*1000;
    const windup=(p.classId==='mage'||p.classId==='necro') ? .38 : .3;
    this.state.pending.push({actor:p.id,target:target.uid,generation:target.generation,hitAt:this.state.time+windup*1000,skill:p.skill,monster:false});
    this.event('attack',p.id,target.uid,{skill:p.skill,generation:target.generation});p.skill=null;
  }
  private resolveAttack(a: PendingAttack): void {
    if(a.monster){
      const m=this.state.monsters.find(m=>m.uid===a.actor&&m.alive);
      const p=this.state.characters[a.target];
      if(!m||!p||p.dead||p.generation!==a.generation||p.activeUntil<=this.state.time||safe(p)||p.buffs.vanish>this.state.time||distance(m,p)>this.monsterRange(m)+.65||!this.lineOfSight(m,p))return;
      const damage=Math.max(1,Math.round((monsterDef(m).atk*(1+(m.phase-1)*.32)-p.stats.def*.2)*(p.buffs.guard>this.state.time?.5:1)));
      p.hp=Math.max(0,p.hp-damage);this.event('hit',m.uid,p.id,{amount:damage});
      if(p.hp===0){p.dead=true;p.xp=Math.max(0,p.xp-Math.floor(p.xp*.05));this.cancelControl(p);this.event('death',p.id);this.checkpoint();}
      return;
    }
    const p=this.state.characters[a.actor];const target=this.state.monsters.find(m=>m.uid===a.target&&m.alive&&m.generation===a.generation);
    if(!p||p.dead||p.activeUntil<=this.state.time||!target||distance(p,target)>classAttackRange(p.classId)+.9||!this.lineOfSight(p,target))return;
    const skill=a.skill===null?undefined:CLASSES[p.classId as ClassId].skills[a.skill] as Skill;
    const magic=p.classId==='mage'||p.classId==='necro';
    const critical=this.random()<p.stats.crit/100;
    const damage=Math.max(1,Math.round((magic?p.stats.matk:p.stats.atkMin+this.random()*(p.stats.atkMax-p.stats.atkMin))*(skill?.mul??1)*(critical?classCombatProfile(p.classId,p.level,p.stats).critMultiplier:1)));
    const hit=(m:WorldMonster,amount:number)=>{
      if(!resolveAttackAccuracy(p.stats.accuracy,this.random()).hit){this.event('miss',p.id,m.uid);return false;}
      this.damage(m,amount,p,critical);return true;
    };
    if(!hit(target,damage))return;
    if(skill?.chain){
      const visited=new Set([target.uid]);let last=target;
      for(let hop=1;hop<skill.chain;hop++){
        const next=this.state.monsters.filter(m=>m.alive&&!visited.has(m.uid)&&distance(last,m)<= (skill.chainRadius??6.5)&&this.lineOfSight(last,m)).sort((a,b)=>distance(last,a)-distance(last,b))[0];
        if(!next)break;visited.add(next.uid);if(!hit(next,Math.max(1,Math.round(damage*Math.pow(skill.chainFalloff??.76,hop)))))break;last=next;
      }
    }else if(skill?.aoe){for(const m of this.state.monsters)if(m.uid!==target.uid&&m.alive&&distance(m,target)<=skill.aoe&&this.lineOfSight(target,m))hit(m,Math.round(damage*.72));}
    if(target.alive&&skill){
      if(skill.stun)target.status.stun=this.state.time+skill.stun*1000;
      if(skill.slow)target.status.slow=this.state.time+skill.slow*1000;
      if(skill.dot){target.status.dot=this.state.time+skill.dot*1000;target.status.nextDot=this.state.time+1000;target.status.dotOwner=p.id;}
      if(skill.knock){const len=Math.max(.001,distance(p,target));this.move(target,{x:(target.x-p.x)/len,z:(target.z-p.z)/len},skill.knock,this.monsterRadius(target));}
    }
    if(skill?.leech)p.hp=Math.min(p.maxHp,p.hp+Math.round(damage*skill.leech));
  }
  private monsterTick(m:WorldMonster,dt:number):void {
    const region=SPAWN_REGIONS.find(r=>r.id===m.regionId);
    const def=monsterDef(m);const radius=this.monsterRadius(m);const boss='boss' in def;
    if(m.status.dot>this.state.time&&m.status.nextDot<=this.state.time){const p=this.state.characters[m.status.dotOwner??''];if(p)this.damage(m,Math.max(2,Math.round(p.stats.matk*.08)),p,false);m.status.nextDot+=1000;}
    if(!m.alive||m.status.stun>this.state.time)return;
    const candidates=Object.values(this.state.characters).filter(p=>!p.dead&&p.activeUntil>this.state.time&&!safe(p)&&p.buffs.vanish<=this.state.time);
    const target=candidates.sort((a,b)=>distance(m,a)-distance(m,b))[0];
    const speed=monsterMovementSpeed(boss)*(m.status.slow>this.state.time?.5:1)*dt;
    let brain=this.brains.get(m.uid);
    if(!brain){brain=new MonsterAiBrain(m.home.x*.173+m.home.z*.127+m.patrolIndex*1.91);this.brains.set(m.uid,brain);}
    const points=region&&!region.boss?patrolRouteInRegion(region,m.home,m.patrolIndex):[];
    const point=points[(m.patrolStep??0)%Math.max(1,points.length)];
    const previous=brain.state;
    const decision=brain.update({dt,alive:true,playerSafe:false,targetAvailable:Boolean(target),
      playerDistance:target?distance(m,target):1000,homeDistance:distance(m,m.home),
      atPatrolPoint:!point||distance(m,point)<.3,aggroRadius:region?.aggroRadius??9,
      leashRadius:region?.leashRadius??14,attackRange:this.monsterRange(m)});
    if(previous==='patrol'&&decision.state==='idle')m.patrolStep=(m.patrolStep??0)+1;
    if(decision.intent==='return'){
      this.walk(m,m.home,speed*.9,radius,m.uid);if(distance(m,m.home)<.55)m.hp=def.hp;return;
    }
    if(target&&(decision.intent==='chase'||decision.intent==='attack')){
      if(decision.intent==='chase'||!this.lineOfSight(m,target))this.walk(m,target,speed,radius,m.uid);
      else if(m.attackReadyAt<=this.state.time){
        m.attackReadyAt=this.state.time+(boss?1450:2050);
        this.state.pending.push({actor:m.uid,target:target.id,generation:target.generation,hitAt:this.state.time+380,skill:null,monster:true});
        this.event('attack',m.uid,target.id);
      }
    }else if(decision.intent==='patrol'&&point){
      if(distance(m,point)>.3)this.walk(m,point,speed*.46,radius,m.uid);
    }
  }
  private selfSkill(p:WorldCharacter,index:number,skill:Skill):void {
    if(p.mp<skill.cost||p.cooldowns[index]>this.state.time)return;
    p.mp-=skill.cost;p.cooldowns[index]=this.state.time+skill.cd*1000;
    if(skill.buff==='guard')p.buffs.guard=this.state.time+7000;
    if(skill.buff==='vanish')p.buffs.vanish=this.state.time+4000;
    if(skill.summon){this.state.summons.push({...this.collision.findNearestFree({x:p.x+1.2,z:p.z+1.2},.42),uid:this.identifier(),owner:p.id,expiresAt:this.state.time+20000,attackReadyAt:0});this.event('summon',p.id);}
    else this.event('buff',p.id,undefined,{skill:index});
  }
  private summonTick(s:WorldSummon,dt:number):void {
    const p=this.state.characters[s.owner];if(!p||p.dead||p.activeUntil<=this.state.time)return;
    const target=this.state.monsters.filter(m=>m.alive).sort((a,b)=>distance(s,a)-distance(s,b))[0];
    if(!target)return;
    if(distance(s,target)>1.8||!this.lineOfSight(s,target))this.walk(s,target,3.6*dt,.42,s.uid);
    else if(s.attackReadyAt<=this.state.time){s.attackReadyAt=this.state.time+1250;this.event('attack',s.uid,target.uid);this.damage(target,Math.max(5,Math.round(p.stats.matk*.3)),p,false);}
  }
  private damage(m:WorldMonster,amount:number,p:WorldCharacter,critical:boolean):void {
    if(!m.alive)return;m.hp=Math.max(0,m.hp-amount);m.owner??=p.id;this.event('hit',p.id,m.uid,{amount,critical});
    const def=monsterDef(m);
    if(m.hp===0){
      m.alive=false;m.respawnAt=this.state.time+('boss' in def?bossRespawnSeconds(def.boss as 'mini'|'big',this.random):28+this.random()*20)*1000;
      this.cancelAttack(m.uid);this.event('death',m.uid);
      const owner=this.state.characters[m.owner]??p;owner.kills++;if('boss' in def)owner.bossKills++;
      const gained=applyExperience(owner.level,owner.xp,def.xp);owner.level=gained.level;owner.xp=gained.xp;
      if(gained.levelsGained){this.recalculate(owner);if(!owner.dead){owner.hp=owner.maxHp;owner.mp=owner.maxMp;}}
      owner.gold+=Math.floor(def.gold[0]+this.random()*(def.gold[1]-def.gold[0]+1));
      for(const [id,chance] of def.drops)if(this.random()<Number(chance))this.addItem(owner,String(id));
      for(const id of rollScrollDrops(m.id,this.random))this.addItem(owner,id);
      if(owner.quest===1&&owner.kills>=8)owner.quest=2;
      if(owner.quest===2&&m.id==='mini')owner.quest=3;
      if(owner.quest===3&&m.id==='big')owner.quest=4;
      this.event('loot',owner.id,m.uid);this.checkpoint();
    }else if(m.id==='big'){
      const phase=m.hp/def.hp<=.3?3:m.hp/def.hp<=.65?2:1;
      if(phase>m.phase){m.phase=phase;for(let i=0;i<phase+1;i++){const a=i/(phase+1)*Math.PI*2;this.spawnMonster(phase===2?'wraith':'bat',{x:m.x+Math.cos(a)*4,z:m.z+Math.sin(a)*4},this.identifier());}}
    }
  }
  private spawnMonster(id:string,point:Position,uid:string,regionId?:string,index=0):void {
    const def=MONSTERS[id as MonsterId];const home=this.collision.findNearestFree(point,id==='big'?1.2:id==='mini'?.9:.42);
    this.state.monsters.push({...home,uid,id,home,regionId,patrolIndex:index,hp:def.hp,alive:true,respawnAt:0,attackReadyAt:0,generation:1,phase:1,status:{slow:0,stun:0,dot:0,nextDot:0}});
  }
  private walk(actor:Position,goal:Position,step:number,radius:number,key:string):void {
    let path=this.paths.get(key);
    if(!path||path.expiresAt<=this.state.time||distance(path.goal,goal)>.7){
      path={goal:{...goal},points:findNavigationPath(this.collision,actor,goal,{actorRadius:radius,cellSize:.85,margin:24,maxVisited:4500}),expiresAt:this.state.time+650};this.paths.set(key,path);
    }
    while(path.points.length&&distance(actor,path.points[0])<.15)path.points.shift();
    const point=path.points[0];if(!point)return;
    const d=distance(actor,point);this.move(actor,{x:(point.x-actor.x)/d,z:(point.z-actor.z)/d},Math.min(d,step),radius);
  }
  private move(actor:Position,direction:Position,step:number,radius:number):void {
    const moved=this.collision.resolve(actor,{x:direction.x*step,z:direction.z*step},radius);
    actor.x=Math.max(-158,Math.min(158,moved.x));actor.z=Math.max(-138,Math.min(138,moved.z));
  }
  private lineOfSight(a:Position,b:Position):boolean {return this.collision.hasLineOfSight({...a,y:this.terrain.supportAt(a.x,a.z)+1.1},{...b,y:this.terrain.supportAt(b.x,b.z)+1.1},.15);}
  private monsterRadius(m:WorldMonster):number{return m.id==='big'?1.4:m.id==='mini'?2.05:m.id==='wolf'?1.615:.46;}
  private monsterRange(m:WorldMonster):number{return Math.max(1.65,this.monsterRadius(m)+.64);}
  private cancelAttack(id:string):void {this.state.pending=this.state.pending.filter(a=>a.actor!==id);}
  private cancelControl(p:WorldCharacter):void {p.target=null;p.skill=null;p.destination=null;p.direction={x:0,z:0};this.cancelAttack(p.id);this.paths.delete(p.id);}
  private recalculate(p:WorldCharacter):void {Object.assign(p,calculateEquipmentStats(p.classId,CLASSES[p.classId as ClassId].stats,p.level,p.equipment,itemDef));p.hp=Math.min(p.hp,p.maxHp);p.mp=Math.min(p.mp,p.maxMp);}
  private addItem(p:WorldCharacter,id:string):void {const item=this.item(id);if(addOrStackItem(p.inventory,item,!('slot' in itemDef(item)))==='full')p.lootBuffer.push(item);}
  private item(id:string,count=1):InventoryItem {if(!Object.hasOwn(ITEMS,id))throw Error('unknown-item');return {id,uid:this.identifier(),plus:0,count};}
  private character(id:string):WorldCharacter {const p=this.state.characters[id];if(!p)throw Error('unknown-character');return p;}
  private event(kind:WorldEvent['kind'],actor:string,target?:string,extra:Partial<WorldEvent>={}):void {
    this.events.push({kind,actor,target,...extra,at:this.state.time,sequence:++this.state.sequence});if(this.events.length>256)this.events.shift();
  }
}
