// Tiny synthesized audio: engine, traffic ambience, sfx + afrobeats-inspired loop. No copyrighted assets.
export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engOsc: OscillatorNode | null = null;
  engGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  musicTimer: number | null = null;
  enabled = true;
  step = 0;
  private _disposed = false;

  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // engine
    this.engOsc = this.ctx.createOscillator();
    this.engOsc.type = "sawtooth";
    this.engOsc.frequency.value = 60;
    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0.0;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    this.engOsc.connect(this.engGain); this.engGain.connect(lp); lp.connect(this.master);
    this.engOsc.start();
    // music bus
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    this.startMusic();
  }

  setEnabled(on: boolean) { this.enabled = on; if (this.master && this.ctx) this.master.gain.value = on ? 0.5 : 0; }
  setPaused(p: boolean) {
    if (!this.ctx) return;
    if (p) this.ctx.suspend().catch(() => {});
    else if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  setEngine(speed01: number, boosting: boolean) {
    if (!this.ctx || !this.engOsc || !this.engGain) return;
    const t = this.ctx.currentTime;
    this.engOsc.frequency.setTargetAtTime(55 + speed01 * 130 + (boosting ? 40 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(0.02 + speed01 * 0.06, t, 0.1);
  }

  blip(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.3, when = 0) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.2, vol = 0.25) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(t);
  }

  countBeep(final = false) { this.blip(final ? 880 : 440, final ? 0.4 : 0.15, "square", 0.25); }
  pickup() { this.blip(660, 0.1, "sine", 0.3); this.blip(990, 0.15, "sine", 0.3, 0.1); }
  deliver() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.18, "triangle", 0.32, i * 0.11)); }
  coin() { this.blip(1567, 0.09, "square", 0.18); }
  crash() { this.noise(0.35, 0.4); this.blip(90, 0.3, "sawtooth", 0.35); }
  horn() { this.blip(370, 0.25, "square", 0.25); }
  boostSfx() { this.noise(0.4, 0.2); this.blip(220, 0.35, "sawtooth", 0.2); }
  fail() { this.blip(300, 0.25, "sawtooth", 0.3); this.blip(200, 0.4, "sawtooth", 0.3, 0.2); }

  // Simple upbeat 100bpm shaker + kick + bassline loop
  startMusic() {
    if (this.musicTimer != null || !this.ctx || !this.musicGain || this._disposed) return;
    const pattern = [0, 0, 1, 0, 2, 0, 1, 3]; // drum accents
    this.musicTimer = window.setInterval(() => {
      if (!this.enabled || !this.ctx || !this.musicGain) return;
      const s = this.step++ % 16;
      const t = this.ctx.currentTime;
      const drum = (f: number, v: number) => {
        const o = this.ctx!.createOscillator(); const g = this.ctx!.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g); g.connect(this.musicGain!); o.start(t); o.stop(t + 0.16);
      };
      if (s % 4 === 0) drum(120, 0.5);
      if (pattern[s % 8] === 1) this.hat(t, 0.12);
      if (pattern[s % 8] === 2) drum(200, 0.25);
      if (pattern[s % 8] === 3) this.hat(t, 0.2);
      const bassNotes = [110, 110, 130.8, 98];
      if (s % 4 === 2) this.bass(bassNotes[Math.floor(s / 4) % 4], t);
    }, 150);
  }
  hat(t: number, v: number) {
    if (!this.ctx || !this.musicGain) return;
    const len = 0.05;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.value = v;
    s.connect(hp); hp.connect(g); g.connect(this.musicGain); s.start(t);
  }
  bass(f: number, t: number) {
    if (!this.ctx || !this.musicGain) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.3);
  }

  dispose() {
    this._disposed = true;
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.engOsc) {
      try { this.engOsc.stop(); } catch {}
      this.engOsc.disconnect();
      this.engOsc = null;
    }
    if (this.engGain) { this.engGain.disconnect(); this.engGain = null; }
    if (this.musicGain) { this.musicGain.disconnect(); this.musicGain = null; }
    if (this.master) { this.master.disconnect(); this.master = null; }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
