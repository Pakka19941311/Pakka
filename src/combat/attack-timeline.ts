export type AttackPhase = 'windup' | 'impact' | 'recovery' | 'complete';
export type AttackTimelineEvent = 'impact' | 'complete';

export type AttackTimings = Readonly<{
  windup: number;
  recovery: number;
}>;

export class AttackTimeline {
  private elapsed = 0;
  private impacted = false;
  private completed = false;
  private readonly timings: AttackTimings;

  constructor(timings: AttackTimings) {
    this.timings = timings;
  }

  tick(dt: number): AttackTimelineEvent[] {
    if (this.completed) return [];
    this.elapsed += Math.max(0, dt);
    const events: AttackTimelineEvent[] = [];
    if (!this.impacted && this.elapsed >= this.timings.windup) {
      this.impacted = true;
      events.push('impact');
    }
    if (this.elapsed >= this.timings.windup + this.timings.recovery) {
      this.completed = true;
      events.push('complete');
    }
    return events;
  }

  get phase(): AttackPhase {
    if (this.completed) return 'complete';
    if (this.impacted) return 'recovery';
    return 'windup';
  }
}

export function combatTimings(kind: 'melee' | 'ranged' | 'spell' | 'monster'): AttackTimings {
  if (kind === 'spell') return { windup: 0.48, recovery: 0.42 };
  if (kind === 'ranged') return { windup: 0.34, recovery: 0.38 };
  if (kind === 'monster') return { windup: 0.36, recovery: 0.54 };
  return { windup: 0.24, recovery: 0.36 };
}
