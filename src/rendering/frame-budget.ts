export type FrameSample = { frame: number; simulation: number; render: number };

/** Bounded, local-only diagnostics. No network or personal data collection. */
export class FrameTelemetry {
  private samples: FrameSample[] = [];
  private cursor = 0;
  record(frame: number, simulation: number, render: number): void {
    this.samples[this.cursor] = { frame, simulation, render };
    this.cursor = (this.cursor + 1) % 600;
  }
  snapshot() {
    const times = this.samples.map(s => s.frame).sort((a, b) => a - b);
    const count = times.length;
    const average = count ? times.reduce((a, b) => a + b, 0) / count : 0;
    const p = (value: number) => times[Math.min(count - 1, Math.floor(count * value))] ?? 0;
    return {
      samples: count, fps: average ? 1000 / average : 0,
      averageMs: average, p95Ms: p(0.95), p99Ms: p(0.99), maxMs: p(1),
      longFrames: times.filter(t => t > 50).length,
      simulationMs: count ? this.samples.reduce((n, s) => n + s.simulation, 0) / count : 0,
      renderSubmissionMs: count ? this.samples.reduce((n, s) => n + s.render, 0) / count : 0,
    };
  }
}

export function renderScaling(width: number, height: number, dpr: number, quality: string, requestedScale: number, adaptive = 1): number {
  const budgets: Record<string, number> = { low: 921600, medium: 1440000, high: 2073600, ultra: 3686400 };
  const pixels = Math.max(1, width * height);
  const nativeRatio = Math.max(1, Math.min(dpr || 1, 2));
  const base = Math.min(nativeRatio, Math.sqrt((budgets[quality] ?? budgets.medium) / pixels));
  const ratio = base * Math.max(0.5, Math.min(1.25, requestedScale || 1)) * adaptive;
  return 1 / Math.max(0.25, ratio);
}

export class ResolutionGovernor {
  scale = 1;
  private seconds = 0;
  private count = 0;
  private recovery = 0;
  sample(dt: number): boolean {
    if (dt <= 0 || dt > 0.5) return false;
    this.seconds += dt; this.count += 1;
    if (this.seconds < 2) return false;
    const ms = this.seconds * 1000 / this.count;
    this.seconds = 0; this.count = 0;
    const before = this.scale;
    if (ms > 25) { this.scale = Math.max(0.65, this.scale - 0.1); this.recovery = 0; }
    else if (ms < 18) {
      this.recovery += 1;
      if (this.recovery >= 3) { this.scale = Math.min(1, this.scale + 0.05); this.recovery = 0; }
    } else this.recovery = 0;
    return Math.abs(before - this.scale) > 0.001;
  }
  reset(): void { this.scale = 1; this.seconds = 0; this.count = 0; this.recovery = 0; }
}
