// Sound, synthesised so there are no files to load: the motor's whine rising
// with speed, start beeps, a crunch for course-outs, a shout for the cheer.

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private volume = 0.7;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Start the motor voice. Call from a user gesture's aftermath. */
  start(volume: number) {
    this.setVolume(volume);
    const ctx = this.ensure();
    if (!ctx || !this.master || this.osc) return;
    void ctx.resume();
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "square";
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 3;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.osc.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.motorGain);
    this.motorGain.connect(this.master);
    this.osc.frequency.value = 80;
    this.osc2.frequency.value = 160;
    this.osc.start();
    this.osc2.start();
  }

  /** Motor pitch follows speed; quiet when the car isn't running. */
  motor(speedKmh: number, running: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.osc || !this.osc2 || !this.motorGain || !this.filter) return;
    const t = ctx.currentTime;
    const f = 90 + speedKmh * 26;
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
    this.filter.frequency.setTargetAtTime(600 + speedKmh * 60, t, 0.08);
    this.motorGain.gain.setTargetAtTime(running ? 0.05 + Math.min(0.06, speedKmh * 0.002) : 0, t, 0.1);
  }

  stop() {
    try {
      this.osc?.stop();
      this.osc2?.stop();
    } catch {
      /* already stopped */
    }
    this.osc?.disconnect();
    this.osc2?.disconnect();
    this.osc = this.osc2 = null;
  }

  beep(freq: number, dur: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = 0.12;
    g.gain.setTargetAtTime(0, ctx.currentTime + dur * 0.7, 0.03);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  noise(dur: number, gain: number, cutoff: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  crash() {
    this.noise(0.35, 0.5, 2200);
  }

  thud() {
    this.noise(0.12, 0.25, 500);
  }

  cheer() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(320, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.25);
    g.gain.value = 0.15;
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.06);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  }
}

export const audio = new Audio();
