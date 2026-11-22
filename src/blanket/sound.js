// Looping background music, a sampled pickup, and soft synthesised chimes.
import pickupWav from './pickup_coin.wav';
import grassMp3 from './grass.mp3';

const KEY = 'blanket-hill-sound';
const MUSIC_URL = 'music/peaceful-journey.mp3';
const MUSIC_VOLUME = 0.35;
const PICKUP_GAIN = 2;
const RUSTLE_GAIN = 4; // The recording is very quiet, so this still plays softly.
const RUSTLE_CROSSFADE_SECONDS = 0.4;
const RUSTLE_MIN_SPEED = 0.6;
const RUSTLE_FULL_SPEED = 18;

export class Sound {
  constructor() {
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch { this.enabled = true; }
    this.ctx = null;
    const unlock = () => {
      if (!this.ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.22 : 0;
        this.master.connect(this.ctx.destination);
        this.ctx.decodeAudioData(pickupWav.slice().buffer, (buffer) => { this.pickup = buffer; }, () => {});
        this.makeRustle();
        this.makeMusic();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.syncMusic();
    };
    // Touch browsers only allow playback to begin on pointerup or click.
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) addEventListener(type, unlock);
    document.addEventListener('visibilitychange', () => {
      this.syncMusic();
      if (document.hidden) this.rustle(0); // Frames stop while hidden, so silence it here.
    });
  }

  makeRustle() {
    this.rustleGain = this.ctx.createGain();
    this.rustleGain.gain.value = 0;
    this.rustleGain.connect(this.master);
    this.ctx.decodeAudioData(grassMp3.slice().buffer, (clip) => this.startRustle(clip), () => {});
  }

  /** Loops the recording, blending its tail into its head so there is no seam. */
  startRustle(clip) {
    const { ctx } = this;
    const source = clip.getChannelData(0);
    const fade = Math.floor(ctx.sampleRate * RUSTLE_CROSSFADE_SECONDS);
    const length = clip.length - fade;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    data.set(source.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = source[i] * Math.sqrt(t) + source[length + i] * Math.sqrt(1 - t);
    }
    this.rustleSource = ctx.createBufferSource();
    this.rustleSource.buffer = buffer;
    this.rustleSource.loop = true;
    this.rustleSource.playbackRate.value = 0.85 + 0.3 * (this.rustleLevel || 0);
    this.rustleSource.connect(this.rustleGain);
    this.rustleSource.start();
  }

  /** Grass gets louder and busier as the roll speeds up. */
  rustle(speed) {
    if (!this.rustleGain) return;
    const k = Math.min(1, Math.max(0, (speed - RUSTLE_MIN_SPEED) / (RUSTLE_FULL_SPEED - RUSTLE_MIN_SPEED)));
    if (k === this.rustleLevel) return;
    this.rustleLevel = k;
    const now = this.ctx.currentTime;
    this.rustleGain.gain.setTargetAtTime(k * RUSTLE_GAIN, now, 0.3);
    this.rustleSource?.playbackRate.setTargetAtTime(0.85 + 0.3 * k, now, 0.3);
  }

  makeMusic() {
    this.music = new Audio(MUSIC_URL);
    this.music.loop = true;
    // Web Audio sets the level on iOS, but it would silence the track on file:// pages.
    if (location.protocol === 'file:') {
      this.music.volume = MUSIC_VOLUME;
    } else {
      const level = this.ctx.createGain();
      level.gain.value = MUSIC_VOLUME;
      this.ctx.createMediaElementSource(this.music).connect(level);
      level.connect(this.ctx.destination);
    }
  }

  /** Plays only while sound is on and the tab is visible. */
  syncMusic() {
    if (!this.music) return;
    if (this.enabled && !document.hidden) {
      if (this.music.paused) this.music.play().catch(() => { /* Retried on the next input. */ });
    } else {
      this.music.pause();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
    if (this.master) this.master.gain.value = this.enabled ? 0.22 : 0;
    this.syncMusic();
    return this.enabled;
  }

  tone(freq, at, length, gain) {
    if (!this.enabled || this.ctx?.state !== 'running') return;
    const start = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.001, start + length);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  /** Plays when a blanket is collected. */
  wrap() {
    if (!this.enabled || !this.pickup || this.ctx.state !== 'running') return;
    const source = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    source.buffer = this.pickup;
    amp.gain.value = PICKUP_GAIN;
    source.connect(amp);
    amp.connect(this.master);
    source.start();
  }

  splash() {
    this.tone(520, 0, 0.12, 0.3);
    this.tone(340, 0.05, 0.16, 0.26);
    this.tone(220, 0.11, 0.22, 0.22);
  }

  snug() {
    [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, i * 0.09, 0.9, 0.34));
  }
}
