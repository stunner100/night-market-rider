// Tiny synthesized audio: engine, rain, generator and sound effects. Music comes from the live radio.
export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engOsc: OscillatorNode | null = null;
  engGain: GainNode | null = null;
  enabled = true;
  private rainGain: GainNode | null = null;
  private genGain: GainNode | null = null;
  private loops: AudioScheduledSourceNode[] = [];
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
    // Rain: looped noise through a soft band-pass.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const rain = this.ctx.createBufferSource(); rain.buffer = buf; rain.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.5;
    this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(bp); bp.connect(this.rainGain); this.rainGain.connect(this.master); rain.start();
    // Generator: a chugging low hum for dumsor.
    const gen = this.ctx.createOscillator(); gen.type = "sawtooth"; gen.frequency.value = 47;
    const chug = this.ctx.createOscillator(); chug.frequency.value = 6;
    const chugDepth = this.ctx.createGain(); chugDepth.gain.value = 3;
    chug.connect(chugDepth); chugDepth.connect(gen.frequency);
    const genLp = this.ctx.createBiquadFilter(); genLp.type = "lowpass"; genLp.frequency.value = 180;
    this.genGain = this.ctx.createGain(); this.genGain.gain.value = 0;
    gen.connect(genLp); genLp.connect(this.genGain); this.genGain.connect(this.master); gen.start(); chug.start();
    this.loops.push(rain, gen, chug);
  }

  setRain(level: number) {
    if (this.ctx && this.rainGain) this.rainGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.4);
  }
  setGenerator(level: number) {
    if (this.ctx && this.genGain) this.genGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.5);
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
    this.engGain.gain.setTargetAtTime(speed01 < 0 ? 0 : 0.012 + speed01 * 0.06, t, 0.1);
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
  /** Feature-phone style double trill. */
  ring() { for (let i = 0; i < 2; i++) { this.blip(1320, 0.09, "square", 0.12, i * 0.28); this.blip(1660, 0.09, "square", 0.1, i * 0.28 + 0.1); } }
  textAlert() { this.blip(1046, 0.07, "sine", 0.2); this.blip(1568, 0.1, "sine", 0.2, 0.08); }
  /** Another driver's two-tone horn, quieter with distance. */
  trafficHorn(distance: number) {
    const vol = 0.11 * Math.max(0.15, 1 - distance / 70);
    const base = 300 + Math.random() * 160;
    const beeps = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < beeps; i++) {
      this.blip(base, 0.16, "square", vol, i * 0.22);
      this.blip(base * 1.26, 0.16, "square", vol * 0.7, i * 0.22);
    }
  }
  boostSfx() { this.noise(0.4, 0.2); this.blip(220, 0.35, "sawtooth", 0.2); }
  fail() { this.blip(300, 0.25, "sawtooth", 0.3); this.blip(200, 0.4, "sawtooth", 0.3, 0.2); }

  dispose() {
    this._disposed = true;
    if (this.engOsc) {
      try { this.engOsc.stop(); } catch {}
      this.engOsc.disconnect();
      this.engOsc = null;
    }
    for (const node of this.loops) { try { node.stop(); } catch {} node.disconnect(); }
    this.loops = [];
    if (this.engGain) { this.engGain.disconnect(); this.engGain = null; }
    if (this.master) { this.master.disconnect(); this.master = null; }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
