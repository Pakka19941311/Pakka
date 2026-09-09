import {SKILL_BOOKS} from '../data/skill-books.ts';
import {classAttackRange,classCombatProfile} from '../core/game-rules.ts';
import type {WorldCharacter as Hero,WorldMonster as Mob,WorldSummon,Position,WorldEvent} from '../network/world-protocol.ts';
export type BookEffect={id:string;owner:string;appliedAt:number;expiresAt:number;values:Record<string,number>};
export type BookDot={id:string;owner:string;expiresAt:number;nextAt:number;damage:number;range?:number;carry?:number};
export type BookArea={id:string;owner:string;generation:number;point:Position;radius:number;damage:number;remaining:number;nextAt:number;interval:number;limit:number;fx:string};
export type BookTrap={id:string;owner:string;generation:number;point:Position;expiresAt:number;damage:number;hit:string[]};
type Host={
  now():number;heroes():Hero[];monsters():Mob[];summons():WorldSummon[];areas():BookArea[];traps():BookTrap[];
  random():number;uid():string;hp(m:Mob):number;safe(p:Position):boolean;visible(a:Position,b:Position):boolean;
  damage(m:Mob,n:number,p:Hero,critical:boolean):void;recalculate(p:Hero):void;
  event(kind:WorldEvent['kind'],actor:string,target?:string,extra?:Partial<WorldEvent>):void;
  provoke(m:Mob,p:Hero):void;release(m:Mob):void;cancel(id:string):void;
};
const dist=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.z-b.z);
export class BookSystem {
  private host:Host;
  constructor(host:Host){this.host=host;}
  effects(p:Hero|Mob):BookEffect[]{return (p.bookEffects??[]).filter(e=>e.expiresAt>this.host.now());}
  value(p:Hero|Mob,key:string):number{return this.effects(p).reduce((sum,e)=>sum+(e.values[key]??0),0);}
  range(p:Hero):number{return classAttackRange(p.classId)*(1+this.value(p,'range')/100);}
  attackSpeed(p:Hero):number{return 1+this.value(p,'attackSpeed')/100;}
  modifyStats(p:Hero):void{
    const before=classCombatProfile(p.classId,p.level,p.stats);
    for(const key of ['def','mdef','dex','evasion'] as const)p.stats[key]+=this.value(p,key);
    const after=classCombatProfile(p.classId,p.level,p.stats);
    p.stats.atkMin+=Math.round(after.physicalScaling)-Math.round(before.physicalScaling);
    p.stats.atkMax+=Math.round(after.physicalScaling)-Math.round(before.physicalScaling);
    p.stats.accuracy+=Math.round(after.accuracy)-Math.round(before.accuracy);
    p.stats.crit+=after.critChance-before.critChance;
    p.stats.evasion+=this.value(p,'dex')*.45;
    p.stats.evasion*=1+this.value(p,'evasionPercent')/100;
    p.stats.speed*=1+this.value(p,'speed')/100;
    p.maxHp=Math.round(p.maxHp*(1+this.value(p,'hp')/100));
    p.buffs.vanish=Math.max(0,...this.effects(p).filter(e=>e.values.invisible).map(e=>e.expiresAt));
  }
  effect(p:Hero|Mob,id:string,owner:string,seconds:number,values:Record<string,number>):void{
    p.bookEffects??=[];const old=p.bookEffects.find(e=>e.id===id);
    // Refreshing one effect does not move its icon in the application order.
    p.bookEffects=p.bookEffects.filter(e=>e.id!==id);
    p.bookEffects.push({id,owner,appliedAt:old?.appliedAt??this.host.now(),expiresAt:this.host.now()+seconds*1000,values});
    if('classId' in p)this.host.recalculate(p);
    this.host.event('buff',owner,'classId' in p?p.id:p.uid,{bookId:id,effect:SKILL_BOOKS[id]?.fx??'curse',durationMs:seconds*1000});
  }
  directDamage(p:Hero,amount:number):number{return amount*(1+this.value(p,'damage')/100);}
  physical(p:Hero):number{return p.stats.atkMin+this.host.random()*(p.stats.atkMax-p.stats.atkMin);}
  normalDamage(p:Hero,amount:number):number{
    amount=this.directDamage(p,amount);
    if(this.value(p,'invisible')){
      amount*=1+this.host.random();p.bookEffects=p.bookEffects?.filter(e=>!e.values.invisible);this.host.recalculate(p);
    }
    return Math.max(1,Math.round(amount));
  }
  dot(m:Mob,p:Hero,id:string,damage:number,seconds:number,range?:number):void{
    m.bookDots??=[];const old=m.bookDots.find(d=>d.id===id&&d.owner===p.id);
    m.bookDots=m.bookDots.filter(d=>d!==old);
    m.bookDots.push({id,owner:p.id,expiresAt:this.host.now()+seconds*1000,nextAt:old?.nextAt??this.host.now()+1000,damage,range,carry:old?.carry??0});
  }
  physicalHit(p:Hero,m:Mob):void{if(this.value(p,'poison')&&m.alive)this.dot(m,p,'poison',this.host.hp(m)*.035/5,5);}
  attacked(p:Hero,m:Mob):void{if(this.value(p,'retaliation')&&dist(p,m)<=3)this.dot(m,p,'lightning',75,10,3);}
  hit(p:Hero,m:Mob,amount:number,fx:string,critical=false,fixed=false,opener=false):void{
    if(!m.alive||this.host.safe(p)||!this.host.visible(p,m))return;
    const magical=['fire','bone','lightning','curse'].includes(fx);
    const debuff=fixed?0:this.value(m,magical?'mdefDown':'defDown')*.2;
    this.host.event('release',p.id,m.uid,{effect:fx,durationMs:0,generation:m.generation});
    this.host.damage(m,Math.max(1,Math.round((fixed?amount:opener?this.normalDamage(p,amount):this.directDamage(p,amount))+debuff)),p,critical);
    if(!magical&&!fixed)this.physicalHit(p,m);
  }
  owns(p:Hero,id:string):boolean{return p.inventory.some(i=>i.id===id&&i.count>0);}
  cast(p:Hero,id:string,targetId?:string,point?:Position):void{
    const b=SKILL_BOOKS[id];if(!b)throw Error('unknown-book');
    if(b.classId!==p.classId)throw Error('class-restricted');
    if(p.level<b.level)throw Error('book-level');if(!this.owns(p,id))throw Error('book-not-owned');
    if(p.dead||!p.grounded)throw Error('cannot-cast');
    if((p.bookCastReadyAt??0)>this.host.now())throw Error('cast-busy');
    p.bookCooldowns??={};if((p.bookCooldowns[id]??0)>this.host.now())throw Error('cooldown');
    if(p.mp<b.cost)throw Error('resource');
    const target=this.host.monsters().find(m=>m.uid===targetId&&m.alive);
    let ally=p;
    if(b.mode==='ally'&&targetId&&targetId!==p.id){const found=this.host.heroes().find(h=>h.id===targetId&&!h.dead&&h.activeUntil>this.host.now());if(!found)throw Error('invalid-ally');ally=found;}
    if(b.mode==='enemy'&&!target)throw Error('invalid-target');
    const center=b.mode==='area'?(point??target):b.mode==='enemy'?target:b.mode==='ally'?ally:p;
    if(!center||![center.x,center.z].every(Number.isFinite))throw Error('invalid-target');
    if(dist(p,center)>this.range(p)+.1||!this.host.visible(p,center))throw Error('out-of-range');
    if(['enemy','area','trap'].includes(b.mode)&&this.host.safe(p))throw Error('safe-zone');
    p.mp-=b.cost;p.bookCooldowns[id]=this.host.now()+b.cd*1000;p.bookCastReadyAt=this.host.now()+250;
    const level=b.level,c=p.classId;
    this.host.event('attack',p.id,target?.uid,{bookId:id,skill:Math.min(b.column,3),impactAt:this.host.now(),endsAt:this.host.now()+350,readyAt:p.attackReadyAt});
    const buff=(values:Record<string,number>,who:Hero|Mob=p)=>this.effect(who,id,p.id,b.duration,values);
    if(level===10){this.hit(p,target!,(['mage','necro'].includes(c)?p.stats.matk:this.physical(p))*1.5,b.fx,true,false,true);return;}
    if(c==='knight'){
      if(level===20)buff({speed:10,attackSpeed:8});
      if(level===30)buff({def:5});
      if(level===40){buff({});for(const m of this.near(p,7)){this.effect(m,id,p.id,15,{taunt:1});this.host.provoke(m,p);}}
      if(level===50){const base=p.maxHp/(1+this.value(p,'hp')/100);buff({hp:45});p.hp=Math.min(p.maxHp,p.hp+Math.round(base*.45));}
      if(level===60){this.hit(p,target!,this.physical(p)*1.1,'slash');this.dot(target!,p,'fire',5+this.host.random()*4+p.stats.matk*.1,7);}
    }else if(c==='ranger'){
      if(level===20)buff({dex:10});if(level===30)buff({slow:40},target!);if(level===40)buff({attackSpeed:25});if(level===50)buff({range:20});
      if(level===60){const point={x:p.x+Math.sin(p.yaw)*1.8,z:p.z+Math.cos(p.yaw)*1.8};this.host.traps().push({id:this.host.uid(),owner:p.id,generation:p.generation,point,expiresAt:this.host.now()+30000,damage:this.directDamage(p,this.physical(p)*3),hit:[]});}
    }else if(c==='mage'){
      if(level===20)buff({speed:10,attackSpeed:10});
      if(level===30){for(const h of this.host.heroes().filter(h=>!h.dead&&h.activeUntil>this.host.now()&&(h.id===ally.id||dist(h,p)<=4)&&this.host.visible(p,h)))buff({def:10,mdef:13,evasion:3},h);}
      if(level===40)buff({damage:100});
      if(level===50)this.area(p,id,center,4,(p.stats.def+p.stats.mdef)*.3,5,1000,999,b.fx);
      if(level===60)this.summon(p,id,'infernal',15);
    }else if(c==='necro'){
      if(level===20)this.summon(p,id,'skeleton',7);
      if(level===30)for(const m of this.near(target!,3).filter(m=>dist(p,m)<=this.range(p)))buff({defDown:10,mdefDown:10,attackSlow:7},m);
      if(level===40)this.summon(p,id,'fire_golem',115);
      if(level===50)this.area(p,id,center,4,p.stats.matk*1.2,3,700,4,b.fx);
      if(level===60){buff({sleep:1},target!);this.host.cancel(target!.uid);}
    }else if(c==='assassin'){
      if(level===20)buff({evasionPercent:50});if(level===30)buff({poison:1});
      if(level===40){buff({invisible:1});for(const m of this.host.monsters().filter(m=>m.targetId===p.id))this.host.release(m);}
      if(level===50)buff({evasionPercent:30,speed:15,def:15});if(level===60)buff({retaliation:1});
    }
  }
  private near(point:Position,radius:number):Mob[]{return this.host.monsters().filter(m=>m.alive&&dist(m,point)<=radius).sort((a,b)=>dist(a,point)-dist(b,point));}
  private area(p:Hero,id:string,point:Position,radius:number,damage:number,remaining:number,interval:number,limit:number,fx:string):void{
    this.host.areas().push({id,owner:p.id,generation:p.generation,point:{x:point.x,z:point.z},radius,damage:this.directDamage(p,damage),remaining,nextAt:this.host.now()+interval,interval,limit,fx});
  }
  private summon(p:Hero,id:string,kind:string,duration:number):void{
    // One summon of each kind per owner, including refresh after reconnect.
    for(const s of this.host.summons())if(s.owner===p.id&&s.bookKind===kind)s.expiresAt=this.host.now();
    const uid=this.host.uid();this.host.summons().push({uid,owner:p.id,bookKind:kind,ownerGeneration:p.generation,x:p.x+1,z:p.z,yOffset:0,grounded:true,yaw:p.yaw,action:'idle',actionStartedAt:this.host.now(),actionEndsAt:0,expiresAt:this.host.now()+duration*1000,attackReadyAt:this.host.now()+500});
    this.effect(p,id,p.id,duration,{});this.host.event('summon',p.id,uid,{bookId:id,durationMs:duration*1000});
  }
  tick():void{
    const now=this.host.now();
    for(const actor of [...this.host.heroes(),...this.host.monsters()]){
      const expired=(actor.bookEffects??[]).filter(e=>e.expiresAt<=now);
      if(expired.length){actor.bookEffects=actor.bookEffects!.filter(e=>e.expiresAt>now);if('classId' in actor)this.host.recalculate(actor);else for(const e of expired)if(e.values.taunt&&!e.values.struck)this.host.release(actor);}
      if('classId' in actor)continue;
      for(const d of actor.bookDots??[]){
        const p=this.host.heroes().find(p=>p.id===d.owner);
        if(actor.alive&&p&&!p.dead&&p.activeUntil>now&&d.nextAt<=now+1e-6&&d.nextAt<=d.expiresAt+1e-6){
          if(!d.range||dist(p,actor)<=d.range){
            const raw=d.damage+(d.carry??0);const amount=d.nextAt+1000>d.expiresAt+1e-6?Math.round(raw):Math.floor(raw+1e-8);d.carry=raw-amount;
            // An applied burn/poison continues behind cover. Only retaliation has a range condition.
            if(amount>0){this.host.event('release',p.id,actor.uid,{effect:d.id,durationMs:0,generation:actor.generation});this.host.damage(actor,amount,p,false);}
          }
          d.nextAt+=1000;
        }
      }
      actor.bookDots=(actor.bookDots??[]).filter(d=>actor.alive&&d.expiresAt>=now);
    }
    for(const a of this.host.areas())if(a.remaining>0&&a.nextAt<=now){
      const p=this.host.heroes().find(p=>p.id===a.owner&&p.generation===a.generation&&!p.dead&&p.activeUntil>now);
      if(!p){a.remaining=0;continue;}for(const m of this.near(a.point,a.radius).slice(0,a.limit))this.hit(p,m,a.damage,a.fx,false,true);a.remaining--;a.nextAt=now+a.interval;
    }
    for(const t of this.host.traps())if(t.expiresAt>now){
      const p=this.host.heroes().find(p=>p.id===t.owner&&p.generation===t.generation&&!p.dead&&p.activeUntil>now);
      if(!p){t.expiresAt=now;continue;}for(const m of this.near(t.point,1.4)){const key=m.uid+':'+m.generation;if(t.hit.includes(key))continue;t.hit.push(key);this.hit(p,m,t.damage,'impact',false,true);}
    }
  }
  summonTick(s:WorldSummon,dt:number,walk:(s:WorldSummon,goal:Position,step:number)=>void):boolean{
    if(!s.bookKind)return false;
    const p=this.host.heroes().find(p=>p.id===s.owner&&!p.dead&&p.generation===s.ownerGeneration&&p.activeUntil>this.host.now());
    if(!p){s.expiresAt=this.host.now();return true;}
    const target=this.near(p,14).find(m=>this.host.visible(p,m));
    if(!target||this.host.safe(p)){if(dist(s,p)>2)walk(s,p,6*dt);else s.action='idle';return true;}
    const range=s.bookKind==='skeleton'?2:3;
    if(dist(s,target)>range){walk(s,target,6*dt);return true;}
    if(s.attackReadyAt>this.host.now())return true;
    s.yaw=Math.atan2(target.x-s.x,target.z-s.z);s.attackReadyAt=this.host.now()+1000;s.action='attack';s.actionStartedAt=this.host.now();s.actionEndsAt=this.host.now()+650;
    this.host.event('attack',s.uid,target.uid,{endsAt:s.actionEndsAt,impactAt:this.host.now()});
    for(const m of (s.bookKind==='skeleton'?[target]:this.near(s,3))){
      if(s.bookKind==='fire_golem')this.hit(p,m,this.host.hp(m)*.03,'fire',false,true);
      else if(s.bookKind==='infernal'){this.hit(p,m,this.physical(p),'slash');this.hit(p,m,p.stats.matk,'fire');}
      else this.hit(p,m,this.physical(p),'slash');
    }return true;
  }
}
