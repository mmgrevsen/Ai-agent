/**
 * Procedural sound: every effect and the music loops are synthesized with WebAudio, so the game ships
 * without audio files. Swap in sampled assets later by implementing the same SoundId interface.
 */
export type SoundId =
  | 'tap'
  | 'deploy'
  | 'hit'
  | 'crit'
  | 'death'
  | 'coin'
  | 'rep'
  | 'warcry'
  | 'special'
  | 'victory'
  | 'defeat'
  | 'levelup'
  | 'upgrade'
  | 'telegraph'
  | 'boss'
  | 'error'
  | 'chest'
  | 'heal';

export type MusicTheme = 'home' | 'battle' | 'boss' | null;

interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

const SCALES: Record<Exclude<MusicTheme, null>, { notes: number[]; tempo: number; wave: OscillatorType }> = {
  home: { notes: [0, 4, 7, 11, 12, 7, 4, 2], tempo: 360, wave: 'triangle' },
  battle: { notes: [0, 3, 7, 10, 12, 10, 7, 5], tempo: 230, wave: 'square' },
  boss: { notes: [0, 1, 7, 6, 12, 6, 3, 1], tempo: 200, wave: 'sawtooth' },
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.4, sfx: 0.8 };
  private theme: MusicTheme = null;
  private musicTimer: number | null = null;
  private step = 0;
  private lastPlayed = new Map<SoundId, number>();

  /** Must be called from a user gesture on iOS/Chrome before audio can play. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      if (this.theme) this.startMusicLoop();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxGain || !this.musicGain) return;
    this.master.gain.value = this.volumes.master;
    this.sfxGain.gain.value = this.volumes.sfx * 0.5;
    this.musicGain.gain.value = this.volumes.music * 0.08;
  }

  setMusic(theme: MusicTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.stopMusicLoop();
    if (theme && this.ctx) this.startMusicLoop();
  }

  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private startMusicLoop(): void {
    if (!this.theme || !this.ctx) return;
    const cfg = SCALES[this.theme];
    const base = this.theme === 'home' ? 196 : 164.8;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
      const semis = cfg.notes[this.step % cfg.notes.length]!;
      const bass = this.step % 4 === 0;
      this.tone(this.musicGain, base * Math.pow(2, semis / 12), cfg.tempo / 1000 * 0.9, cfg.wave, 0.5);
      if (bass) this.tone(this.musicGain, (base / 2) * Math.pow(2, (cfg.notes[0]! + (this.step % 16 >= 8 ? 5 : 0)) / 12), (cfg.tempo / 1000) * 3.5, 'sine', 0.9);
      this.step++;
    }, cfg.tempo);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private tone(dest: AudioNode, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dest: AudioNode, dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(dest);
    src.start(t);
  }

  play(id: SoundId): void {
    const d = this.sfxGain;
    if (!this.ctx || !d || this.ctx.state !== 'running') return;
    // Throttle very frequent sounds so big fights stay pleasant.
    const now = performance.now();
    const minGap = id === 'hit' ? 45 : id === 'coin' ? 60 : id === 'death' ? 50 : 0;
    if (minGap && now - (this.lastPlayed.get(id) ?? 0) < minGap) return;
    this.lastPlayed.set(id, now);
    switch (id) {
      case 'tap':
        this.tone(d, 660, 0.06, 'triangle', 0.3);
        break;
      case 'deploy':
        this.tone(d, 300, 0.12, 'square', 0.25, 600);
        this.noise(d, 0.1, 0.2, 1200);
        break;
      case 'hit':
        this.noise(d, 0.05, 0.25, 2000);
        break;
      case 'crit':
        this.noise(d, 0.08, 0.35, 3000);
        this.tone(d, 880, 0.08, 'square', 0.15);
        break;
      case 'death':
        this.tone(d, 240, 0.18, 'sawtooth', 0.15, 80);
        break;
      case 'coin':
        this.tone(d, 1320, 0.06, 'square', 0.12);
        this.tone(d, 1760, 0.08, 'square', 0.12, undefined, 0.05);
        break;
      case 'heal':
        this.tone(d, 520, 0.15, 'sine', 0.15, 780);
        break;
      case 'rep':
        this.tone(d, 523, 0.08, 'triangle', 0.35);
        this.tone(d, 784, 0.12, 'triangle', 0.35, undefined, 0.07);
        break;
      case 'warcry':
        this.tone(d, 196, 0.5, 'sawtooth', 0.3, 392);
        this.tone(d, 294, 0.5, 'sawtooth', 0.2, 587, 0.05);
        break;
      case 'special':
        this.noise(d, 0.5, 0.5, 900);
        this.tone(d, 110, 0.6, 'sawtooth', 0.4, 55);
        this.tone(d, 880, 0.3, 'square', 0.2, 1760);
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(d, f, 0.25, 'triangle', 0.35, undefined, i * 0.12));
        break;
      case 'defeat':
        [392, 349, 330].forEach((f, i) => this.tone(d, f, 0.35, 'triangle', 0.25, undefined, i * 0.18));
        break;
      case 'levelup':
        [392, 523, 659, 784].forEach((f, i) => this.tone(d, f, 0.15, 'square', 0.2, undefined, i * 0.07));
        break;
      case 'upgrade':
        this.tone(d, 440, 0.12, 'triangle', 0.3, 880);
        this.tone(d, 880, 0.2, 'triangle', 0.25, 1320, 0.1);
        break;
      case 'telegraph':
        this.tone(d, 150, 0.4, 'sawtooth', 0.2, 300);
        break;
      case 'boss':
        this.tone(d, 82, 0.9, 'sawtooth', 0.35, 65);
        this.noise(d, 0.8, 0.3, 400);
        break;
      case 'error':
        this.tone(d, 200, 0.15, 'square', 0.2, 150);
        break;
      case 'chest':
        this.noise(d, 0.2, 0.3, 1500);
        [659, 880, 1175].forEach((f, i) => this.tone(d, f, 0.2, 'triangle', 0.25, undefined, 0.15 + i * 0.08));
        break;
    }
  }
}

export const sound = new SoundEngine();
