const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Procedural engine and ground sounds; no downloaded recordings. Starts only on a user gesture. */
export class EngineAudio {
  constructor() { this.enabled = false; this.context = null; }

  async enable() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    if (!this.context) {
      this.context = new AudioContext();
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
      this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 850; this.filter.Q.value = 0.45;
      this.filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.osc = ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 35; this.osc.connect(this.filter); this.osc.start();
      this.harmonic = ctx.createOscillator(); this.harmonic.type = 'triangle';
      this.harmonicGain = ctx.createGain(); this.harmonicGain.gain.value = 0.38;
      this.harmonic.connect(this.harmonicGain); this.harmonicGain.connect(this.filter); this.harmonic.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), samples = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.035) / 1.015; samples[i] = previous * 2.8; }
      this.noise = ctx.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
      this.groundFilter = ctx.createBiquadFilter(); this.groundFilter.type = 'bandpass'; this.groundFilter.frequency.value = 400; this.groundFilter.Q.value = 0.6;
      this.groundGain = ctx.createGain(); this.groundGain.gain.value = 0;
      this.noise.connect(this.groundFilter); this.groundFilter.connect(this.groundGain); this.groundGain.connect(this.master); this.noise.start();
    }
    await this.context.resume(); this.enabled = true;
    this.master.gain.setTargetAtTime(0.26, this.context.currentTime, 0.08);
    return true;
  }

  disable() {
    this.enabled = false;
    if (this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
  }

  update(state, input, spec, paused) {
    if (!this.context || !this.enabled) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(paused ? 0 : 0.26, t, 0.12);
    const electric = spec.powertrain === 'electric';
    this.osc.type = electric ? 'sine' : 'sawtooth';
    const cylinders = spec.bodyStyle === 'sedan' ? 4 : 6;
    const pulses = electric ? 85 + state.rpm * .075 : Math.max(15, state.rpm / 60 * cylinders / 2);
    this.osc.frequency.setTargetAtTime(pulses * (electric ? 1 : .55), t, .04);
    this.harmonic.frequency.setTargetAtTime(pulses * (electric ? 2.02 : 1.13), t, .04);
    this.harmonicGain.gain.setTargetAtTime(electric ? .12 : .38, t, .08);
    this.filter.frequency.setTargetAtTime(electric ? 650 + state.rpm * .15 : 220 + state.rpm * .18 + input.throttle * 420, t, .08);
    const driveGain = electric ? clamp(state.rpm / 1600, 0, 1) * (.08 + .17 * input.throttle + Math.min(.06, (state.regenerativePowerKW || 0) / 1800)) : .25 + .33 * input.throttle;
    this.engineGain.gain.setTargetAtTime(state.engineOn ? driveGain : 0, t, .12);
    const roughness = { asphalt: 0.12, dirt: 0.4, rock: 0.52, sand: 0.36, mud: 0.58, wetland: 0.65 }[state.terrain] || 0.35;
    const slip = Math.max(0, ...(state.wheels || []).map(w => Math.abs(w.slip)));
    this.groundGain.gain.setTargetAtTime(clamp(Math.abs(state.speed) / 20, 0, 1) * roughness + clamp(slip, 0, 1) * 0.12, t, 0.1);
    this.groundFilter.frequency.setTargetAtTime(state.waterDepth > 0.05 ? 350 : state.terrain === 'asphalt' ? 1500 : 700, t, 0.1);
  }
}
