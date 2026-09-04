/** Fixed 60 Hz local simulation. Long visible frames catch up; background time does not. */
export class SimulationClock {
  readonly step = 1 / 60;
  private debt = 0;
  droppedSeconds = 0;

  advance(elapsed: number, tick: (dt: number) => boolean | void): number {
    const safe = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    this.droppedSeconds += Math.max(0, safe - 0.5);
    this.debt += Math.min(safe, 0.5);
    let steps = 0;
    while (this.debt + 1e-9 >= this.step && steps < 30) {
      this.debt -= this.step;
      steps += 1;
      if (tick(this.step) === false) { this.reset(); break; }
    }
    return steps;
  }

  reset(): void { this.debt = 0; }
}
