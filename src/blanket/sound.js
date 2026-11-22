// Soft synthesised chimes, so the game needs no audio files.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const KEY = 'blanket-hill-sound';

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
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
    if (this.master) this.master.gain.value = this.enabled ? 0.22 : 0;
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

  /** Each blanket in a round plays the next note up the scale. */
  wrap(index) {
    const f = 330 * 2 ** (SCALE[index % SCALE.length] / 12);
    this.tone(f, 0, 0.32, 0.5);
    this.tone(f * 2, 0.05, 0.2, 0.16);
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
