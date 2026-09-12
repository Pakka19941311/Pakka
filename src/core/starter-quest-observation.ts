import {recordStarterQuestEvent} from './starter-quests-v3.ts';
import type {StarterQuestState,StarterQuestEvent} from './starter-quests-v3.ts';
import {STARTER_LOCATION_ID,STARTER_OUTSKIRTS_CHECKPOINT,STARTER_BOAR_ROUTE} from '../data/starter-progression-v3.ts';
import type {SpatialPoint} from '../world/world-space.ts';
import {sameSpace,spatialDistance} from '../world/world-space.ts';

export type StarterObservationGroup={id:string;speciesId:string;center:SpatialPoint;aliveCount:number;radius:number;visible:boolean};
export type StarterObservationContext={now:number;generation:number;locationId:string;grounded:boolean;speed:number;standing:boolean;safe:boolean;cityInterior:boolean;inCombat:boolean;groups:StarterObservationGroup[];serviceNpcId?:string};
/** Observe authoritative motion and living groups. No authored checkpoint is assumed to exist. */
export function observeStarterQuestObjectives<T extends StarterQuestState>(state:T,context:StarterObservationContext):T{
 const progress=state.starterProgress;if(!progress||!Object.values(progress.quests).some(q=>q&&['active','ready'].includes(q.status)))return state;
 let next={...state,starterProgress:structuredClone(progress)};
 const p=next.starterProgress,previous=p.observation;
 const resetRoute=()=>{delete p.observation;const q=p.quests['QUEST-104'];if(q?.status==='active'&&!q.evidence.includes('boar-retreat'))q.evidence=q.evidence.filter(f=>!f.startsWith('boar-'));};
 if(state.dead||state.hp<=0||context.locationId!==STARTER_LOCATION_ID||!context.grounded||context.inCombat){resetRoute();return next;}
 const elapsed=previous?Math.max(0,(context.now-previous.lastAt)/1000):0;
 const continuous=Boolean(previous&&previous.generation===context.generation&&sameSpace(previous.position,state)&&elapsed<=2&&
  spatialDistance(previous.position,state)<=Math.max(0,context.speed)*elapsed+1);
 if(previous&&!continuous)resetRoute();
 const current=p.observation??{generation:context.generation,lastAt:context.now,position:{x:state.x,z:state.z,spaceId:state.spaceId}};
 const events:StarterQuestEvent[]=[];const emit=(event:StarterQuestEvent)=>{events.push(event);};
 const locationId=STARTER_LOCATION_ID;
 // The return is a real transition from the hunting outskirts, observed after the beetle count completes.
 if((p.quests['QUEST-105']?.kills??0)>=6&&!context.safe)current.outsideAfterHunt=true;
 if(continuous&&current.outsideAfterHunt&&context.safe&&context.cityInterior)emit({kind:'cityReturn',cityId:'greenfall',safe:true,locationId});
 if(context.serviceNpcId)emit({kind:'service',npcId:context.serviceNpcId,locationId});
 const slimeQuest=p.quests['QUEST-101'];
 if(slimeQuest?.status==='active'&&!slimeQuest.evidence.includes('outskirts-inspected')){
  const group=context.groups.filter(g=>g.speciesId==='spider'&&g.aliveCount>0&&g.visible&&spatialDistance(state,g.center)>=g.radius&&spatialDistance(state,g.center)<=g.radius+18)
   .sort((a,b)=>spatialDistance(state,a.center)-spatialDistance(state,b.center))[0];
  if(group&&context.standing){
   if(!continuous||current.slime?.groupId!==group.id)current.slime={groupId:group.id,since:context.now};
   else if(context.now-current.slime.since>=1000)emit({kind:'inspect',checkpointId:STARTER_OUTSKIRTS_CHECKPOINT,locationId});
  }else delete current.slime;
 }
 const boarQuest=p.quests['QUEST-104'];
 if(boarQuest?.status==='active'&&!boarQuest.evidence.includes('boar-retreat')){
  const groups=context.groups.filter(g=>g.speciesId==='v3_forest_boar'&&g.aliveCount>=2&&g.visible);
  if(!current.boar){
   const group=groups.filter(g=>spatialDistance(state,g.center)>=g.radius&&spatialDistance(state,g.center)<=g.radius+12).sort((a,b)=>spatialDistance(state,a.center)-spatialDistance(state,b.center))[0];
   if(group&&continuous){current.boar={groupId:group.id,center:{...group.center},radius:group.radius,lastAngle:Math.atan2(state.z-group.center.z,state.x-group.center.x),turn:0};emit({kind:'routeCheckpoint',routeId:STARTER_BOAR_ROUTE,checkpoint:'approach',locationId});}
  }else{
   const route=current.boar,group=groups.find(g=>g.id===route.groupId),distance=spatialDistance(state,route.center);
   if(!group||distance<route.radius){delete current.boar;boarQuest.evidence=boarQuest.evidence.filter(f=>!f.startsWith('boar-'));}
   else{
    const angle=Math.atan2(state.z-route.center.z,state.x-route.center.x),delta=Math.atan2(Math.sin(angle-route.lastAngle),Math.cos(angle-route.lastAngle));route.lastAngle=angle;
    if(continuous&&distance<=route.radius+12&&Math.abs(delta)<.5)route.turn+=delta;
    if(Math.abs(route.turn)>=Math.PI/2)emit({kind:'routeCheckpoint',routeId:STARTER_BOAR_ROUTE,checkpoint:'flank',locationId});
    if(Math.abs(route.turn)>=Math.PI/2&&distance>=route.radius+24)emit({kind:'routeCheckpoint',routeId:STARTER_BOAR_ROUTE,checkpoint:'retreat',locationId});
   }
  }
 }
 next.starterProgress.observation={...current,generation:context.generation,lastAt:context.now,position:{x:state.x,z:state.z,spaceId:state.spaceId}};
 for(const event of events)next=recordStarterQuestEvent(next,event);
 return next;
}
