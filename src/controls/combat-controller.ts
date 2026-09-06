import type { ExplicitTarget } from './targeting-controller';

export const SKILL_BUFFER_SECONDS = 0.35;

export type SkillIntent = Readonly<{ targetId: string; skillIndex: number }>;
export type BufferedSkill = SkillIntent & Readonly<{ expiresAt: number }>;
export type CombatControlSnapshot = Readonly<{
  autoAttackTargetId: string | null;
  skillIntent: SkillIntent | null;
  bufferedSkill: BufferedSkill | null;
}>;

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
  private queuedSkill: SkillIntent | null = null;
  private bufferedSkill: BufferedSkill | null = null;
  private approachingTargetId: string | null = null;

  get snapshot(): CombatControlSnapshot {
    return {
      autoAttackTargetId: this.autoAttackTargetId,
      skillIntent: this.queuedSkill ? { ...this.queuedSkill } : null,
      bufferedSkill: this.bufferedSkill ? { ...this.bufferedSkill } : null,
    };
  }

  engageBasic(targetId: string): void {
    this.autoAttackTargetId = targetId;
    this.queuedSkill = null;
    this.bufferedSkill = null;
    this.approachingTargetId = null;
  }

  // A validated command may need more than 350 ms to approach its target.
  // It is deliberately distinct from a short input buffer during recovery.
  queueSkill(targetId: string, skillIndex: number): void {
    this.queuedSkill = { targetId, skillIndex };
    this.bufferedSkill = null;
    this.approachingTargetId = null;
  }

  // The caller admits only valid presses during the final recovery window.
  // Use simulation time here: UI windows do not suspend this deadline.
  bufferSkill(targetId: string, skillIndex: number, now: number): void {
    this.bufferedSkill = { targetId, skillIndex, expiresAt: now + SKILL_BUFFER_SECONDS };
    this.approachingTargetId = null;
  }

  expireBufferedSkill(now: number): void {
    if (this.bufferedSkill && now >= this.bufferedSkill.expiresAt) this.bufferedSkill = null;
  }

  // Call only when the current action is free. Invalid commands are consumed,
  // never retained as hidden resource/cooldown waiters. The caller repeats
  // target/resource checks again at release before spending resources.
  promoteBufferedSkill(now: number, canPromote: (intent: SkillIntent) => boolean = () => true): SkillIntent | null {
    this.expireBufferedSkill(now);
    const buffered = this.bufferedSkill;
    this.bufferedSkill = null;
    if (!buffered || !canPromote(buffered)) return null;
    const intent = { targetId: buffered.targetId, skillIndex: buffered.skillIndex };
    this.queuedSkill = intent;
    this.approachingTargetId = null;
    return { ...intent };
  }

  discardQueuedSkill(): void {
    this.queuedSkill = null;
    this.approachingTargetId = null;
  }

  cancelPursuit(): void {
    this.autoAttackTargetId = null;
    this.queuedSkill = null;
    this.bufferedSkill = null;
    this.approachingTargetId = null;
  }

  targetRemoved(targetId: string): void {
    if (this.autoAttackTargetId === targetId) this.autoAttackTargetId = null;
    if (this.queuedSkill?.targetId === targetId) this.queuedSkill = null;
    if (this.bufferedSkill?.targetId === targetId) this.bufferedSkill = null;
    if (this.approachingTargetId === targetId) this.approachingTargetId = null;
  }

  isEngagedWith(targetId: string): boolean {
    return this.autoAttackTargetId === targetId || this.queuedSkill?.targetId === targetId || this.bufferedSkill?.targetId === targetId;
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

    // Once pursuit begins, settle slightly inside the existing attack range.
    // After settling, small target motion stays in attack until it leaves that
    // original range; no hit distance is extended by this hysteresis.
    if (distance > range) this.approachingTargetId = target.uid;
    const approachRange = this.approachingTargetId === target.uid ? range * 0.9 : range;
    if (distance > approachRange) {
      const stopDistance = Math.max(0.35, range * 0.78);
      const travel = Math.max(0, distance - stopDistance);
      return {
        kind: 'approach',
        targetId: target.uid,
        x: input.player.x + (dx / Math.max(distance, 0.0001)) * travel,
        z: input.player.z + (dz / Math.max(distance, 0.0001)) * travel,
      };
    }
    this.approachingTargetId = null;

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
