export type AudioSettings = Readonly<{
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  ui: number;
  muteOnBlur: boolean;
}>;

export type GameSound =
  | 'swordSwing'
  | 'meleeImpact'
  | 'swordClash'
  | 'footstep'
  | 'monsterAggro'
  | 'monsterHit'
  | 'monsterDeath'
  | 'potion'
  | 'coin'
  | 'hammer';

const SOUND_FILES: Record<GameSound, string> = {
  swordSwing: '/assets/audio/sfx/sword-swing.ogg',
  meleeImpact: '/assets/audio/sfx/melee-impact.ogg',
  swordClash: '/assets/audio/sfx/sword-clash.ogg',
  footstep: '/assets/audio/sfx/footstep-mud.ogg',
  monsterAggro: '/assets/audio/sfx/monster-aggro.ogg',
  monsterHit: '/assets/audio/sfx/monster-hit.ogg',
  monsterDeath: '/assets/audio/sfx/monster-death.ogg',
  potion: '/assets/audio/sfx/potion.ogg',
  coin: '/assets/audio/sfx/coin.ogg',
  hammer: '/assets/audio/sfx/hammer.ogg',
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class GameAudio {
  private settings: AudioSettings;
  private unlocked = false;
  private inTown = true;
  private readonly musicTown = new Audio('/assets/audio/music/town-in-ruins.ogg');
  private readonly musicWild = new Audio('/assets/audio/music/dark-shrine.ogg');
  private readonly forest = new Audio('/assets/audio/ambient/forest.mp3');
  private readonly pools = new Map<GameSound, HTMLAudioElement[]>();
  private stepCooldown = 0;

  constructor(settings: AudioSettings) {
    this.settings = settings;
    [this.musicTown, this.musicWild, this.forest].forEach((track) => {
      track.loop = true;
      track.preload = 'auto';
    });
    Object.entries(SOUND_FILES).forEach(([key, source]) => {
      const pool = Array.from({ length: 4 }, () => {
        const sound = new Audio(source);
        sound.preload = 'auto';
        return sound;
      });
      this.pools.set(key as GameSound, pool);
    });
    window.addEventListener('blur', () => {
      if (this.settings.muteOnBlur) this.pauseAll();
    });
    window.addEventListener('focus', () => {
      if (this.unlocked && this.settings.muteOnBlur) void this.resumeLoops();
    });
    this.apply(settings);
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.unlocked = true;
    await this.resumeLoops();
  }

  apply(settings: AudioSettings): void {
    this.settings = settings;
    const master = clamp01(settings.master);
    this.musicTown.volume = master * clamp01(settings.music) * (this.inTown ? 0.34 : 0);
    this.musicWild.volume = master * clamp01(settings.music) * (this.inTown ? 0 : 0.3);
    this.forest.volume = master * clamp01(settings.ambience) * (this.inTown ? 0.16 : 0.34);
    this.pools.forEach((pool, name) => {
      const category = name === 'coin' ? settings.ui : settings.sfx;
      pool.forEach((sound) => { sound.volume = master * clamp01(category) * 0.62; });
    });
  }

  setRegion(isTown: boolean): void {
    if (this.inTown === isTown) return;
    this.inTown = isTown;
    this.apply(this.settings);
    if (this.unlocked) void this.resumeLoops();
  }

  update(dt: number): void {
    this.stepCooldown = Math.max(0, this.stepCooldown - dt);
  }

  footstep(): void {
    if (this.stepCooldown > 0) return;
    // Foot contacts come from the actual locomotion phase; only suppress bursts
    // when several contacts were crossed during one very slow rendered frame.
    this.stepCooldown = 0.09;
    this.play('footstep', 0.38 + Math.random() * 0.12, 0.94 + Math.random() * 0.12);
  }

  play(name: GameSound, gain = 1, rate = 1): void {
    if (!this.unlocked || gain <= 0) return;
    const pool = this.pools.get(name);
    if (!pool) return;
    const sound = pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
    sound.currentTime = 0;
    sound.playbackRate = Math.max(0.55, Math.min(1.65, rate));
    const category = name === 'coin' ? this.settings.ui : this.settings.sfx;
    sound.volume = clamp01(this.settings.master * category * gain * 0.62);
    void sound.play().catch(() => undefined);
  }

  private async resumeLoops(): Promise<void> {
    const desired = this.inTown ? this.musicTown : this.musicWild;
    const silent = this.inTown ? this.musicWild : this.musicTown;
    silent.pause();
    try {
      await Promise.all([desired.play(), this.forest.play()]);
    } catch {
      // Browsers may revoke autoplay after tab suspension; the next user gesture retries.
    }
  }

  private pauseAll(): void {
    this.musicTown.pause();
    this.musicWild.pause();
    this.forest.pause();
    this.pools.forEach((pool) => pool.forEach((sound) => sound.pause()));
  }
}
