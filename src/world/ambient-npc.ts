export type AmbientState = 'idle' | 'walk' | 'activity';
export type AmbientWaypoint = Readonly<{ x: number; z: number; activity: 'warm' | 'trade' | 'work' | 'guard' | 'talk' }>;

export type AmbientDecision = Readonly<{
  state: AmbientState;
  waypoint: AmbientWaypoint;
  changed: boolean;
}>;

export class AmbientNpcBrain {
  private readonly waypoints: readonly AmbientWaypoint[];
  private state: AmbientState = 'idle';
  private waypointIndex: number;
  private timer: number;

  constructor(waypoints: readonly AmbientWaypoint[], seed = 0) {
    if (!waypoints.length) throw new Error('Ambient NPC requires at least one waypoint');
    this.waypoints = waypoints;
    this.waypointIndex = Math.abs(seed) % waypoints.length;
    this.timer = 0.8 + (Math.abs(seed * 17) % 20) / 10;
  }

  update(dt: number, position: Readonly<{ x: number; z: number }>): AmbientDecision {
    let changed = false;
    this.timer -= dt;
    const waypoint = this.waypoints[this.waypointIndex];
    if (this.state === 'idle' && this.timer <= 0) {
      this.state = 'walk';
      changed = true;
    } else if (this.state === 'walk' && Math.hypot(waypoint.x - position.x, waypoint.z - position.z) < 0.35) {
      this.state = 'activity';
      this.timer = 2.5 + (this.waypointIndex % 3) * 0.8;
      changed = true;
    } else if (this.state === 'activity' && this.timer <= 0) {
      this.state = 'idle';
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      this.timer = 1.1 + (this.waypointIndex % 2) * 0.9;
      changed = true;
    }
    return { state: this.state, waypoint: this.waypoints[this.waypointIndex], changed };
  }
}
