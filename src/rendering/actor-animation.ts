import { AnimationGroup, TransformNode, Vector3 } from '@babylonjs/core';
import type { AttackTimings } from '../combat/attack-timeline.ts';

export type ActorAction = 'idle' | 'walk' | 'jump' | 'attack' | 'hit' | 'death';
type Gait = { group: AnimationGroup; duration: number; nativeSpeed: number };

// Measured from the shipped rigs: backward foot displacement during the lower
// quarter of the contact-height range, averaged across feet. Units scale with height.
const GAITS: Record<string, { height: number; walk: number; run: number }> = {
  Warrior: { height: 2.05, walk: 1.036, run: 3.187 },
  Wizard: { height: 2.05, walk: 0.993, run: 3.057 },
  Ranger: { height: 2.05, walk: 1.041, run: 3.203 },
  Rogue: { height: 2.05, walk: 1.024, run: 3.152 },
  Monk: { height: 2.05, walk: 1.065, run: 3.279 },
  Fox: { height: 1.25, walk: 1.401, run: 1.558 },
  Skeleton: { height: 1.9, walk: 3.228, run: 3.228 },
};

function clipName(group: AnimationGroup): string {
  return group.name.split('|').at(-1)!.split('-').at(-1)!.toLowerCase();
}
function clipDuration(group?: AnimationGroup): number {
  if (!group) return 0;
  return (group.to - group.from) / (group.targetedAnimations[0]?.animation.framePerSecond ?? 60);
}

/** One sampled clip per actor. Simulation advances time/distance; pose evaluation
 * happens once per rendered frame, even when a slow frame needs several simulation ticks. */
export class ActorAnimation {
  private readonly clips = new Map<string, AnimationGroup>();
  private readonly idle?: AnimationGroup;
  private readonly attack?: AnimationGroup;
  private readonly death?: AnimationGroup;
  private readonly hit?: AnimationGroup;
  private readonly walk?: Gait;
  private readonly run?: Gait;
  private current?: AnimationGroup;
  private gait?: Gait;
  private actionValue: ActorAction = 'idle';
  private elapsed = 0;
  private phaseValue = 0;
  private duration = 1;
  private dirty = true;
  private visible = true;
  private hitRemaining = 0;
  private frameSeconds = 0;
  private readonly localHeight: number;
  starts = 0;
  playbackRate = 1;
  readonly model: string;
  readonly height: number;
  private readonly groups: AnimationGroup[];
  private readonly pose: TransformNode;
  private readonly preferRun: boolean;

  constructor(model: string, height: number, groups: AnimationGroup[],
    pose: TransformNode, scale: number, preferRun = false) {
    this.model = model; this.height = height; this.groups = groups; this.pose = pose; this.preferRun = preferRun;
    for (const group of groups) this.clips.set(clipName(group), group);
    this.idle = this.find('idle_weapon', 'idle', 'survey', 'flying');
    this.attack = model === 'Wizard' ? this.find('spell1', 'spell2', 'staff_attack')
      : this.find('sword_attack', 'dagger_attack', 'bow_shoot', 'attack');
    this.death = this.find('death', 'die');
    this.hit = this.find('recievehit', 'hit');
    const profile = GAITS[model];
    const makeGait = (group: AnimationGroup | undefined, speed: number): Gait | undefined => group
      ? { group, duration: Math.max(0.1, clipDuration(group)), nativeSpeed: speed * height / (profile?.height ?? height) } : undefined;
    this.walk = makeGait(this.find('walk', 'running', 'run', 'flying'), profile?.walk ?? 2.25);
    this.run = makeGait(this.find('run_weapon', 'run_holding', 'run', 'running'), profile?.run ?? 2.25);
    this.localHeight = height / Math.max(0.00001, scale);
    // Only the presentation wrapper tilts; collision/grounding and canonical scale remain untouched.
    pose.setPivotPoint(new Vector3(0, this.localHeight * 0.45, 0));
    groups.forEach(group => { group.stop(); group.enableBlending = true; });
  }

  private find(...names: string[]): AnimationGroup | undefined {
    for (const name of names) {
      const exact = this.clips.get(name);
      if (exact) return exact;
      for (const [key, group] of this.clips) if (key.endsWith(`_${name}`)) return group;
    }
    return undefined;
  }

  request(action: ActorAction, restart = false): void {
    if (this.actionValue === 'death' && action !== 'death') return;
    if (action === this.actionValue && !restart) return;
    this.actionValue = action;
    this.elapsed = 0;
    if (action !== 'walk' && action !== 'jump') this.phaseValue = 0;
    this.dirty = true;
    this.duration = action === 'death' ? Math.max(0.65, clipDuration(this.death))
      : action === 'hit' ? Math.min(0.3, clipDuration(this.hit) || 0.2) : 1;
  }

  beginAttack(maxDuration = Infinity): AttackTimings {
    this.request('attack', true);
    this.duration = Math.max(0.35, Math.min(clipDuration(this.attack) || 0.8, maxDuration));
    const contact = this.model === 'Wizard' ? 0.56 : this.model === 'Ranger' ? 0.48 : 0.42;
    return { windup: this.duration * contact, recovery: this.duration * (1 - contact) };
  }

  reactToHit(): void {
    this.hitRemaining = 0.18;
    if (this.actionValue === 'idle' && this.hit) this.request('hit', true);
  }

  advance(dt: number, distance = 0): void {
    if (!this.visible) return;
    this.frameSeconds += dt;
    this.elapsed += dt;
    this.hitRemaining = Math.max(0, this.hitRemaining - dt);
    if (this.actionValue === 'hit' && this.elapsed >= this.duration) this.request('idle');
    if (this.actionValue === 'walk') {
      const speed = distance / Math.max(dt, 0.00001);
      const next = speed < 0.00001 && this.gait ? this.gait
        : this.run && (this.preferRun || speed > (this.gait === this.run ? 1.55 : 1.85) * this.height / 2.05) ? this.run : this.walk;
      if (next !== this.gait) { this.gait = next; this.dirty = true; }
      if (this.gait) {
        this.phaseValue = (this.phaseValue + distance / (this.gait.nativeSpeed * this.gait.duration)) % 1;
        this.playbackRate = speed / this.gait.nativeSpeed;
      }
    } else if (this.actionValue === 'idle') {
      this.phaseValue = (this.phaseValue + dt / Math.max(0.1, clipDuration(this.idle))) % 1;
      this.playbackRate = 1;
    } else if (this.actionValue !== 'jump') {
      this.phaseValue = Math.min(1, this.elapsed / this.duration);
      this.playbackRate = clipDuration(this.actionValue === 'attack' ? this.attack : this.death) / this.duration;
    }
  }

  render(): void {
    if (!this.visible) return;
    const group = this.actionValue === 'walk' ? this.gait?.group
      : this.actionValue === 'jump' ? (this.run?.group ?? this.walk?.group ?? this.idle)
      : this.actionValue === 'attack' ? this.attack ?? this.idle
      : this.actionValue === 'death' ? this.death ?? this.idle
      : this.actionValue === 'hit' ? this.hit ?? this.idle : this.idle;
    if (this.dirty || group !== this.current) {
      this.current?.stop();
      this.current = group;
      if (group) { group.start(true, 1); group.pause(); this.starts++; }
      this.dirty = false;
    }
    if (group) {
      group.blendingSpeed = Math.min(1, Math.max(1 / 240, this.frameSeconds) / 0.08);
      const fallback = (this.actionValue === 'attack' && !this.attack) || (this.actionValue === 'death' && !this.death);
      const phase = fallback ? 0 : this.actionValue === 'jump' ? 0.06 : this.phaseValue;
      group.goToFrame(group.from + (group.to - group.from) * phase);
    }
    this.frameSeconds = 0;
    this.pose.rotation.set(0, 0, 0);
    this.pose.position.set(0, 0, 0);
    if (this.actionValue === 'attack' && !this.attack) {
      const lunge = Math.sin(Math.min(1, this.phaseValue / 0.84) * Math.PI);
      this.pose.rotation.x = -lunge * 0.2;
      this.pose.position.z = lunge * this.localHeight * 0.15;
    } else if (this.actionValue === 'death' && !this.death) {
      const fall = this.phaseValue * this.phaseValue * (3 - 2 * this.phaseValue);
      this.pose.rotation.z = fall * 1.48;
      this.pose.position.y = -this.localHeight * 0.25 * fall;
    } else if (this.actionValue === 'jump') this.pose.rotation.x = -0.08;
    if (this.hitRemaining > 0 && this.actionValue !== 'death') this.pose.rotation.x += Math.sin(this.hitRemaining / 0.18 * Math.PI) * 0.07;
  }

  setVisible(value: boolean): void {
    if (value === this.visible) return;
    this.visible = value;
    if (!value) this.current?.stop();
    else this.dirty = true;
  }

  get action(): ActorAction { return this.actionValue; }
  get phase(): number { return this.phaseValue; }
  get clip(): string | null { return this.current?.name ?? null; }
  get activeGroups(): number { return this.groups.filter(group => group.isStarted).length; }
}
