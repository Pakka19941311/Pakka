import {applyExperience} from './gameplay-session.ts';
import {MAX_LEVEL,xpNeeded} from './game-rules.ts';

type Progress = {id:string;classId:string;level:number;xp:number;cost?:number};
type PreviousProfile = {id:string;classId:string;level:number};
/** Local preview recovery only. The launcher generated these profiles from the
 * database BEFORE the broken teleport. They establish a known minimum, not a
 * fabricated full history. Never accept this evidence through the network API. */
export function teleportProgressRecovery(hero:Progress, previous:PreviousProfile|undefined){
 if(!previous||previous.id!==hero.id||previous.classId!==hero.classId)return null;
 if(!Number.isInteger(previous.level)||previous.level<1||previous.level>MAX_LEVEL||
    !Number.isInteger(hero.level)||hero.level<1||hero.level>=previous.level||
    !Number.isFinite(hero.xp)||hero.xp<0)return null;
 const destinationLevel=hero.cost===0||hero.cost===25?1:hero.cost===90||hero.cost===150?10:0;
 if(!destinationLevel||hero.level<destinationLevel||previous.level<=destinationLevel)return null;
 // XP was relative to the original level. Kills after the reset consumed it
 // against lower thresholds; put that consumed remainder back, too.
 let remainder=hero.xp;
 for(let level=destinationLevel;level<hero.level;level++)remainder+=xpNeeded(level);
 const restored=applyExperience(previous.level,0,remainder);
 return {from:{level:hero.level,xp:hero.xp},to:{level:restored.level,xp:restored.xp},
  previousLaunchLevel:previous.level,destinationLevel,basis:'previous-local-launch-minimum'};
}
