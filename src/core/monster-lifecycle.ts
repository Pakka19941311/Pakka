export type MonsterLifecycleState = 'alive' | 'death' | 'despawned';
export type MonsterLifecycleEvent = 'corpse-finished' | 'respawn';

export class MonsterLifecycle {
  private stateValue: MonsterLifecycleState;
  private remainingValue: number;
  private respawnDelay = 0;
  private generationValue: number;

  constructor(initialDelay = 0) {
    this.stateValue = initialDelay > 0 ? 'despawned' : 'alive';
    this.remainingValue = Math.max(0, initialDelay);
    this.generationValue = initialDelay > 0 ? 0 : 1;
  }

  kill(respawnDelay: number, corpseDuration = 0.65): boolean {
    if (this.stateValue !== 'alive') return false;
    this.stateValue = 'death';
    this.remainingValue = Math.max(0, corpseDuration);
    this.respawnDelay = Math.max(0, respawnDelay);
    return true;
  }

  tick(dt: number): MonsterLifecycleEvent[] {
    if (this.stateValue === 'alive') return [];
    this.remainingValue = Math.max(0, this.remainingValue - Math.max(0, dt));
    if (this.remainingValue > 1e-6) return [];
    if (this.stateValue === 'death') {
      this.stateValue = 'despawned';
      this.remainingValue = this.respawnDelay;
      return ['corpse-finished'];
    }
    this.stateValue = 'alive';
    this.remainingValue = 0;
    this.generationValue += 1;
    return ['respawn'];
  }

  get state(): MonsterLifecycleState { return this.stateValue; }
  get remaining(): number { return this.remainingValue; }
  get generation(): number { return this.generationValue; }
}
