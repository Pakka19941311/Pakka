/** Shared world time. The epoch is persisted with the world, never inferred from local hour. */
export const PHASE_MS=3*60*60*1000;
export const CYCLE_MS=PHASE_MS*2;
export const HASTE_DURATION_MS=10*60*1000;
export const STORAGE_CAPACITY=500;

/** The old one-percent ring band is now empty; scroll and necklace bands are unchanged. */
export function rollNightDrops(random:()=>number):string[]{
 const scroll=random(),jewelry=random(),drops:string[]=[];
 if(scroll<.01)drops.push(scroll<.005?'weapon_scroll_improved':'armor_scroll_improved');
 if(jewelry>=.01&&jewelry<.02)drops.push('fang_necklace');
 return drops;
}
export type WorldCycleSnapshot={epoch:number;serverTime:number;elapsed:number;hour:number;night:boolean;cycle:number;fullMoon:boolean;phaseRemainingMs:number;daylight:number;weather:'sun'|'clouds'|'rain';clouds:number};
export function worldCycleAt(now:number,epoch:number):WorldCycleSnapshot {
 const elapsed=Math.max(0,now-epoch),cycle=Math.floor(elapsed/CYCLE_MS),part=elapsed%CYCLE_MS,night=part>=PHASE_MS;
 const hour=(6+part/CYCLE_MS*24)%24;
 const solar=Math.sin(part/CYCLE_MS*Math.PI*2);
 const daylight=Math.max(0,Math.min(1,(solar+.12)/.65));
 const block=Math.floor(part/(30*60*1000)),seed=((cycle*17+block*11+7)%19)/19;
 const weather=night?'clouds':seed>.72?'rain':seed>.5?'clouds':'sun';
 return {epoch,serverTime:now,elapsed,hour,night,cycle,fullMoon:night&&(cycle+1)%4===0,phaseRemainingMs:PHASE_MS-part%PHASE_MS,daylight,weather,clouds:weather==='rain'?.92:weather==='clouds'?.5:.18};
}
