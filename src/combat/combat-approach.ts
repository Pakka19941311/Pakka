export type CombatPoint = Readonly<{x:number;z:number}>;

/** Existing attack ranges measure centre-to-centre distance. Body clearance
 * constrains approach destinations; it never grants additional attack reach. */
export function combatSpacing(attackRange:number, actorRadius:number, targetRadius:number) {
  const contact = actorRadius + targetRadius + 0.04;
  return { contact, reachable:contact <= attackRange,
    stoppingDistance:Math.min(attackRange, Math.max(attackRange * 0.9, contact)) };
}

export function approachPoint(actor:CombatPoint, target:CombatPoint, stoppingDistance:number):CombatPoint {
  const dx=actor.x-target.x, dz=actor.z-target.z, distance=Math.hypot(dx,dz);
  // A coincident spawn gets a deterministic outward goal, not NaN or the
  // target's centre. The movement resolver still enforces static geometry.
  return {x:target.x+(distance>1e-6?dx/distance:1)*stoppingDistance,
    z:target.z+(distance>1e-6?dz/distance:0)*stoppingDistance};
}

export function facingTarget(yaw:number, actor:CombatPoint, target:CombatPoint):boolean {
  return Math.cos(Math.atan2(target.x-actor.x,target.z-actor.z)-yaw) > 0.97;
}

// Clip duration/contact points are measured from the existing shipped rigs.
// Timing is server-owned and carried in attack events, never a render timer.
const ATTACK_CLIPS:Record<string,number>={Warrior:20/24,Wizard:29/24,Ranger:15/24,Rogue:18/24,Monk:20/24,Fox:.8,Skeleton:22/24,Slime:15/24,Dragon:21/24,Bat:21/24};
export function attackTimings(model:string, maximum=Infinity) {
  const duration=Math.max(.35,Math.min(ATTACK_CLIPS[model]??.8,maximum));
  const contact=model==='Warrior'?.5:model==='Wizard'?.56:model==='Ranger'?.48:.42;
  return {windup:duration*contact*1000,duration:duration*1000};
}
