export type MonsterAiState = 'spawn' | 'idle' | 'patrol' | 'aggro' | 'chase' | 'attack' | 'leash' | 'return' | 'dead' | 'corpse' | 'despawn';
export type MonsterIntent = 'none' | 'patrol' | 'chase' | 'attack' | 'return';

export type MonsterAiInput = Readonly<{
  dt: number;
  alive: boolean;
  playerSafe: boolean;
  targetAvailable?: boolean;
  targetId?: string;
  provoked?: boolean;
  playerDistance: number;
  homeDistance: number;
  atPatrolPoint: boolean;
  aggroRadius: number;
  leashRadius: number;
  attackRange: number;
}>;

export type MonsterAiDecision = Readonly<{
  state: MonsterAiState;
  intent: MonsterIntent;
  changed: boolean;
  targetId: string | null;
}>;

/** Behaviour port of accepted browser build 1e94a0d1. The server additionally
 * retains entity identity and fences terminal lifecycle until explicit respawn. */
export class MonsterAiBrain {
  private stateValue: MonsterAiState = 'spawn';
  private idleTimer: number;
  private targetValue: string | null = null;

  constructor(seed = 0) {
    this.idleTimer = 0.65 + Math.abs(Math.sin(seed * 12.9898)) * 2.15;
  }

  engage(id:string):void {this.targetValue=id;if(!['chase','attack'].includes(this.stateValue))this.stateValue='aggro';}

  reset(seed = 0): void {
    this.stateValue = 'spawn';
    this.targetValue = null;
    this.idleTimer = 0.45 + Math.abs(Math.sin(seed * 7.713)) * 1.85;
  }

  forceLifecycle(state: Extract<MonsterAiState, 'dead' | 'corpse' | 'despawn'>): MonsterAiDecision {
    this.targetValue = null;
    return this.transition(state, 'none');
  }

  update(input: MonsterAiInput): MonsterAiDecision {
    if (this.stateValue === 'dead' || this.stateValue === 'corpse' || this.stateValue === 'despawn') return this.transition(this.stateValue, 'none');
    if (!input.alive) return this.forceLifecycle('dead');
    const sameTarget = !this.targetValue || !input.targetId || this.targetValue === input.targetId;
    const targetAvailable = (input.targetAvailable ?? true) && sameTarget;
    const wasEngaged = this.stateValue === 'aggro' || this.stateValue === 'chase' || this.stateValue === 'attack';
    const mustReturn = input.homeDistance > input.leashRadius
      || this.stateValue === 'leash'
      || this.stateValue === 'return';

    // An unavailable target must not freeze patrols, even if its last position is safe.
    if (mustReturn || (targetAvailable && input.playerSafe)) {
      this.targetValue = null;
      if (input.homeDistance > 0.55) {
        return this.transition(this.stateValue === 'leash' || this.stateValue === 'return' ? 'return' : 'leash', 'return');
      }
      this.idleTimer = Math.max(this.idleTimer, 0.8);
      return this.transition('idle', 'none');
    }

    const maintainsAggro = wasEngaged && input.playerDistance <= input.aggroRadius * 1.55;
    if (targetAvailable && (input.provoked || input.playerDistance <= input.aggroRadius || maintainsAggro)) {
      this.targetValue = input.targetId ?? this.targetValue;
      if (!wasEngaged) return this.transition('aggro', input.playerDistance <= input.attackRange ? 'attack' : 'chase');
      if (input.playerDistance <= input.attackRange) return this.transition('attack', 'attack');
      return this.transition('chase', 'chase');
    }

    this.targetValue = null;
    if (wasEngaged && input.homeDistance > 0.55) return this.transition('leash', 'return');
    if (this.stateValue === 'spawn') {
      this.idleTimer = Math.max(this.idleTimer, 0.35);
      return this.transition('idle', 'none');
    }
    if (this.stateValue === 'patrol' && !input.atPatrolPoint) return this.transition('patrol', 'patrol');
    if (this.stateValue === 'patrol' && input.atPatrolPoint) {
      this.idleTimer = 1.1 + this.idleTimer % 1.7;
      return this.transition('idle', 'none');
    }
    this.idleTimer -= Math.max(0, input.dt);
    if (this.idleTimer <= 0) {
      // No connected player exists in some server ticks; finite fallback keeps
      // the reference pause formula usable in the persistent world.
      const playerDistance = Number.isFinite(input.playerDistance) ? input.playerDistance : 1000;
      this.idleTimer = 1.0 + Math.abs(Math.sin(input.homeDistance * 2.31 + playerDistance)) * 2.2;
      return this.transition('patrol', 'patrol');
    }
    return this.transition('idle', 'none');
  }

  get state(): MonsterAiState {
    return this.stateValue;
  }

  get targetId(): string | null { return this.targetValue; }

  private transition(state: MonsterAiState, intent: MonsterIntent): MonsterAiDecision {
    const changed = state !== this.stateValue;
    this.stateValue = state;
    return { state, intent, changed, targetId: this.targetValue };
  }
}

