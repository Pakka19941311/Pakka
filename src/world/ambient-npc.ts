export type AmbientState = 'idle' | 'walk' | 'activity';
export type AmbientWaypoint = Readonly<{ x: number; z: number; activity: 'warm' | 'trade' | 'work' | 'guard' | 'talk' }>;

export type AmbientDecision = Readonly<{
  state: AmbientState;
  waypoint: AmbientWaypoint;
  changed: boolean;
}>;

const ACTIVITY_BASE_SECONDS: Record<AmbientWaypoint['activity'], number> = {
  warm: 3.2,
  trade: 2.7,
  work: 2.35,
  guard: 3.6,
  talk: 3.0,
};

function hash01(seed: number, cycle: number, salt: number): number {
  const value = Math.sin(seed * 91.733 + cycle * 37.719 + salt * 17.173) * 43758.5453;
  return value - Math.floor(value);
}

export class AmbientNpcBrain {
  private readonly waypoints: readonly AmbientWaypoint[];
  private readonly seed: number;
  private state: AmbientState = 'idle';
  private waypointIndex: number;
  private timer: number;
  private cycle = 0;

  constructor(waypoints: readonly AmbientWaypoint[], seed = 0) {
    if (!waypoints.length) throw new Error('Ambient NPC requires at least one waypoint');
    this.waypoints = waypoints;
    this.seed = seed;
    this.waypointIndex = Math.abs(seed) % waypoints.length;
    this.timer = this.idleDuration();
  }

  private idleDuration(): number {
    // Deterministic variation keeps residents from switching state in lock-step.
    return 0.75 + hash01(this.seed, this.cycle, 1) * 1.7;
  }

  private activityDuration(activity: AmbientWaypoint['activity']): number {
    return ACTIVITY_BASE_SECONDS[activity] + hash01(this.seed, this.cycle, 2) * 1.1;
  }

  update(dt: number, position: Readonly<{ x: number; z: number }>): AmbientDecision {
    let changed = false;
    this.timer -= Math.max(0, dt);
    const waypoint = this.waypoints[this.waypointIndex];

    if (this.state === 'idle' && this.timer <= 0) {
      this.state = 'walk';
      changed = true;
    } else if (this.state === 'walk' && Math.hypot(waypoint.x - position.x, waypoint.z - position.z) < 0.35) {
      this.state = 'activity';
      this.timer = this.activityDuration(waypoint.activity);
      changed = true;
    } else if (this.state === 'activity' && this.timer <= 0) {
      this.state = 'idle';
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      this.cycle += 1;
      this.timer = this.idleDuration();
      changed = true;
    }

    return { state: this.state, waypoint: this.waypoints[this.waypointIndex], changed };
  }
}
