import type { ExplicitTarget } from './targeting-controller';

export type CombatDecision =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'wait'; targetId: string }>
  | Readonly<{ kind: 'approach'; targetId: string; x: number; z: number }>
  | Readonly<{ kind: 'attack'; targetId: string; skillIndex: number | null }>;

export type CombatPlanInput = Readonly<{
  player: Readonly<{ x: number; z: number }>;
  target: ExplicitTarget | null;
  basicRange: number;
  skillRange: (skillIndex: number) => number;
  canBasicAttack: boolean;
  canUseSkill: (skillIndex: number) => boolean;
}>;

export class CombatControl {
  private autoAttackTargetId: string | null = null;
  private queuedSkill: Readonly<{ targetId: string; skillIndex: number }> | null = null;

  engageBasic(targetId: string): void {
    this.autoAttackTargetId = targetId;
    this.queuedSkill = null;
  }

  queueSkill(targetId: string, skillIndex: number): void {
    this.queuedSkill = { targetId, skillIndex };
  }

  cancelPursuit(): void {
    this.autoAttackTargetId = null;
    this.queuedSkill = null;
  }

  targetRemoved(targetId: string): void {
    if (this.autoAttackTargetId === targetId) this.autoAttackTargetId = null;
    if (this.queuedSkill?.targetId === targetId) this.queuedSkill = null;
  }

  isEngagedWith(targetId: string): boolean {
    return this.autoAttackTargetId === targetId || this.queuedSkill?.targetId === targetId;
  }

  plan(input: CombatPlanInput): CombatDecision {
    const target = input.target;
    if (!target?.alive) return { kind: 'idle' };

    const queued = this.queuedSkill?.targetId === target.uid ? this.queuedSkill : null;
    const basicEngaged = this.autoAttackTargetId === target.uid;
    if (!queued && !basicEngaged) return { kind: 'idle' };

    const skillIndex = queued?.skillIndex ?? null;
    const range = skillIndex === null ? input.basicRange : input.skillRange(skillIndex);
    const dx = target.x - input.player.x;
    const dz = target.z - input.player.z;
    const distance = Math.hypot(dx, dz);

    if (distance > range) {
      const stopDistance = Math.max(0.35, range * 0.78);
      const travel = Math.max(0, distance - stopDistance);
      return {
        kind: 'approach',
        targetId: target.uid,
        x: input.player.x + (dx / Math.max(distance, 0.0001)) * travel,
        z: input.player.z + (dz / Math.max(distance, 0.0001)) * travel,
      };
    }

    if (skillIndex !== null) {
      return input.canUseSkill(skillIndex)
        ? { kind: 'attack', targetId: target.uid, skillIndex }
        : { kind: 'wait', targetId: target.uid };
    }
    return input.canBasicAttack
      ? { kind: 'attack', targetId: target.uid, skillIndex: null }
      : { kind: 'wait', targetId: target.uid };
  }

  completeAttack(skillIndex: number | null): void {
    if (skillIndex !== null && this.queuedSkill?.skillIndex === skillIndex) this.queuedSkill = null;
  }
}
