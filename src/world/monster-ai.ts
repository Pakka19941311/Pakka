export type MonsterAiState = 'spawn' | 'idle' | 'patrol' | 'aggro' | 'chase' | 'attack' | 'search' | 'leash' | 'return' | 'dead' | 'corpse' | 'despawn';
export type MonsterIntent = 'none' | 'patrol' | 'chase' | 'attack' | 'search' | 'return';

export type MonsterAiInput = Readonly<{
  /** Simulation seconds, not render delta or a movement displacement. */
  dt: number;
  alive: boolean;
  playerSafe: boolean;
  targetAvailable?: boolean;
  /** The caller must supply the retained target while it still exists. */
  targetId?: string;
  targetVisible?: boolean;
  provoked?: boolean;
  playerDistance: number;
  homeDistance: number;
  atPatrolPoint: boolean;
  aggroRadius: number;
  leashRadius: number;
  attackRange: number;
  searchDuration?: number;
  patrolDuration?: number;
}>;

export type MonsterAiDecision = Readonly<{
  state: MonsterAiState;
  intent: MonsterIntent;
  changed: boolean;
  targetId: string | null;
}>;

const lifecycle = new Set<MonsterAiState>(['dead', 'corpse', 'despawn']);
const engaged = new Set<MonsterAiState>(['aggro', 'chase', 'attack', 'search']);
const HOME_ARRIVAL = 0.55;

/** Owns intent and target lifetime. The world owns navigation, attack timing and damage. */
export class MonsterAiBrain {
  private stateValue: MonsterAiState = 'spawn';
  private targetValue: string | null = null;
  private idleTimer = 0;
  private patrolTimer = 0;
  private searchTimer = 0;
  private seed = 0;
  private pauseSequence = 0;

  constructor(seed = 0) { this.reset(seed); }

  reset(seed = 0): void {
    this.stateValue = 'spawn';
    this.targetValue = null;
    this.seed = Number.isFinite(seed) ? seed : 0;
    this.pauseSequence = 0;
    this.idleTimer = this.nextIdlePause();
    this.patrolTimer = 0;
    this.searchTimer = 0;
  }

  forceLifecycle(state: Extract<MonsterAiState, 'dead' | 'corpse' | 'despawn'>): MonsterAiDecision {
    this.targetValue = null;
    this.patrolTimer = 0;
    this.searchTimer = 0;
    return this.transition(state, 'none');
  }

  update(input: MonsterAiInput): MonsterAiDecision {
    // Snapshots/ticks during corpse display cannot resurrect AI or regress corpse to dead.
    if (lifecycle.has(this.stateValue)) return this.transition(this.stateValue, 'none');
    if (!input.alive) return this.forceLifecycle('dead');
    const dt = Number.isFinite(input.dt) ? Math.max(0, input.dt) : 0;
    const wasEngaged = engaged.has(this.stateValue);
    const sameTarget = !this.targetValue || !input.targetId || this.targetValue === input.targetId;
    const available = (input.targetAvailable ?? true) && sameTarget;
    const visible = input.targetVisible ?? true;
    const safeTarget = available && input.playerSafe;

    if (input.homeDistance > input.leashRadius || this.stateValue === 'leash' || this.stateValue === 'return') {
      return this.returnHome(input.homeDistance);
    }
    if (wasEngaged && (!available || safeTarget)) return this.returnHome(input.homeDistance);

    const inAggro = input.playerDistance <= input.aggroRadius;
    const retainsAggro = wasEngaged && input.playerDistance <= input.aggroRadius * 1.55;
    const eligible = available && !safeTarget && (inAggro || retainsAggro || input.provoked === true);
    if (eligible && visible) {
      this.targetValue = input.targetId ?? this.targetValue;
      this.searchTimer = 0;
      if (!wasEngaged) return this.transition('aggro', input.playerDistance <= input.attackRange ? 'attack' : 'chase');
      // Small exit hysteresis avoids attack/chase chatter at the edge of the range.
      const range = input.attackRange + (this.stateValue === 'attack' ? 0.12 : 0);
      return input.playerDistance <= range ? this.transition('attack', 'attack') : this.transition('chase', 'chase');
    }
    if (eligible && (wasEngaged || input.provoked)) {
      this.targetValue = input.targetId ?? this.targetValue;
      if (this.stateValue !== 'search') this.searchTimer = input.searchDuration ?? 1.5;
      else this.searchTimer -= dt;
      if (this.searchTimer > 0) return this.transition('search', 'search');
      return this.returnHome(input.homeDistance);
    }
    if (wasEngaged) return this.returnHome(input.homeDistance);

    if (this.stateValue === 'spawn') return this.transition('idle', 'none');
    if (this.stateValue === 'patrol') {
      this.patrolTimer -= dt;
      if (!input.atPatrolPoint && this.patrolTimer > 0) return this.transition('patrol', 'patrol');
      // A blocked patrol point must eventually yield to an idle pause and the next point.
      this.idleTimer = this.nextIdlePause();
      return this.transition('idle', 'none');
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.patrolTimer = input.patrolDuration ?? 8;
      return this.transition('patrol', 'patrol');
    }
    return this.transition('idle', 'none');
  }

  get state(): MonsterAiState { return this.stateValue; }
  get targetId(): string | null { return this.targetValue; }

  private returnHome(homeDistance: number): MonsterAiDecision {
    this.targetValue = null;
    this.searchTimer = 0;
    this.patrolTimer = 0;
    if (homeDistance > HOME_ARRIVAL) {
      const returning = this.stateValue === 'leash' || this.stateValue === 'return';
      return this.transition(returning ? 'return' : 'leash', 'return');
    }
    this.idleTimer = this.nextIdlePause();
    return this.transition('idle', 'none');
  }

  private nextIdlePause(): number {
    // Stable per-monster variation, independent of whether a player position is finite.
    const value = Math.sin(this.seed * 12.9898 + ++this.pauseSequence * 7.713) * 43758.5453;
    return 1.1 + (value - Math.floor(value)) * 2.2;
  }

  private transition(state: MonsterAiState, intent: MonsterIntent): MonsterAiDecision {
    const changed = state !== this.stateValue;
    this.stateValue = state;
    return { state, intent, changed, targetId: this.targetValue };
  }
}
