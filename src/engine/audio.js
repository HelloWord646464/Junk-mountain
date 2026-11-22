// All sound is synthesized with the Web Audio API: no audio files needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.loops = {};
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for rumbles and wind
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this._ambience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  _out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.2; p.maxDistance = 80;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }

  _noise(out, { dur = 0.2, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, brown = false, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = brown ? this.brown : this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _tone(out, { freq = 440, dur = 0.3, type = 'sine', gain = 0.3, when = 0, slide = 0, attack = 0.003 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  // Impact sound per material.
  impact(material, pos, strength = 1) {
    if (!this.ctx) return;
    const out = this._out(pos), s = Math.min(1.2, strength);
    switch (material) {
      case 'metal': case 'electronics': {
        const base = 180 + Math.random() * 260;
        for (const [m, gn] of [[1, 0.22], [2.76, 0.12], [5.4, 0.07], [8.9, 0.04]])
          this._tone(out, { freq: base * m, dur: 0.5 + Math.random() * 0.5, gain: gn * s, type: 'sine' });
        this._noise(out, { dur: 0.08, freq: 2500, q: 0.8, gain: 0.35 * s });
        break;
      }
      case 'glass':
        for (let i = 0; i < 4; i++) this._tone(out, { freq: 1800 + Math.random() * 3000, dur: 0.25, gain: 0.07 * s, when: Math.random() * 0.06 });
        this._noise(out, { dur: 0.15, type: 'highpass', freq: 4000, gain: 0.25 * s });
        break;
      case 'wood':
        this._tone(out, { freq: 140 + Math.random() * 80, dur: 0.18, gain: 0.35 * s, type: 'triangle', slide: 0.7 });
        this._noise(out, { dur: 0.1, freq: 800, q: 2, gain: 0.3 * s });
        break;
      case 'rubber':
        this._tone(out, { freq: 70 + Math.random() * 30, dur: 0.2, gain: 0.5 * s, slide: 0.6 });
        this._noise(out, { dur: 0.08, freq: 300, gain: 0.2 * s, type: 'lowpass' });
        break;
      case 'cardboard':
        this._noise(out, { dur: 0.2, freq: 1200, q: 0.6, gain: 0.35 * s });
        this._tone(out, { freq: 110, dur: 0.1, gain: 0.2 * s });
        break;
      default: // plastic
        this._tone(out, { freq: 380 + Math.random() * 200, dur: 0.12, gain: 0.18 * s, type: 'square', slide: 0.5 });
        this._noise(out, { dur: 0.08, freq: 2000, gain: 0.2 * s });
    }
  }

  dig(pos) { if (!this.ctx) return; const o = this._out(pos); this._noise(o, { dur: 0.25, freq: 600, q: 0.7, gain: 0.45, brown: false }); this._noise(o, { dur: 0.3, type: 'lowpass', freq: 200, gain: 0.5, brown: true }); }
  whoosh() { if (!this.ctx) return; this._noise(this.master, { dur: 0.3, freq: 900, q: 0.5, gain: 0.25, attack: 0.12 }); }
  pickup() { if (!this.ctx) return; this._tone(this.master, { freq: 300, dur: 0.1, gain: 0.12, slide: 1.6 }); }
  click() { if (!this.ctx) return; this._tone(this.master, { freq: 900, dur: 0.05, gain: 0.08, type: 'square' }); }
  error() { if (!this.ctx) return; this._tone(this.master, { freq: 180, dur: 0.18, gain: 0.15, type: 'sawtooth' }); }
  place(pos) { if (!this.ctx) return; const o = this._out(pos); this._tone(o, { freq: 90, dur: 0.25, gain: 0.5, slide: 0.6 }); this._noise(o, { dur: 0.15, freq: 1500, gain: 0.25 }); this.impact('metal', pos, 0.5); }
  cash(pos, big = false) {
    if (!this.ctx) return;
    const o = pos ? this._out(pos) : this.master;
    this._tone(o, { freq: 1318, dur: 0.25, gain: 0.18, type: 'triangle' });
    this._tone(o, { freq: 1976, dur: 0.45, gain: 0.16, type: 'triangle', when: 0.07 });
    this._noise(o, { dur: 0.12, type: 'highpass', freq: 5000, gain: 0.15, when: 0.05 });
    if (big) [523, 659, 784, 1046].forEach((f, i) => this._tone(o, { freq: f, dur: 0.6, gain: 0.15, type: 'triangle', when: 0.15 + i * 0.09 }));
  }
  beep(freq = 1200) { if (!this.ctx) return; this._tone(this.master, { freq, dur: 0.07, gain: 0.12, type: 'square' }); }
  fanfare() {
    if (!this.ctx) return;
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => { this._tone(this.master, { freq: f, dur: 0.9, gain: 0.14, type: 'triangle', when: i * 0.12 }); this._tone(this.master, { freq: f * 1.5, dur: 0.6, gain: 0.05, when: i * 0.12 }); });
  }
  sparkle() { if (!this.ctx) return; [1568, 2093, 2637].forEach((f, i) => this._tone(this.master, { freq: f, dur: 0.4, gain: 0.08, when: i * 0.06 })); }

  // Continuous positional loop (burners, belts). Returns a handle with .set(gain).
  loop(name, pos, kind) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = kind === 'fire' ? this.brown : this.noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    if (kind === 'fire') { f.type = 'lowpass'; f.frequency.value = 420; }
    else if (kind === 'hum') { f.type = 'bandpass'; f.frequency.value = 160; f.Q.value = 4; }
    else { f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5; }
    const g = ctx.createGain(); g.gain.value = 0;
    const out = this._out(pos);
    src.connect(f).connect(g).connect(out); src.start();
    let osc = null;
    if (kind === 'hum') { osc = ctx.createOscillator(); osc.frequency.value = 50; const og = ctx.createGain(); og.gain.value = 0.25; osc.connect(og).connect(g); osc.start(); }
    const h = { set: v => g.gain.setTargetAtTime(v, ctx.currentTime, 0.15), stop: () => { try { src.stop(); osc?.stop(); out.disconnect(); } catch {} } };
    this.loops[name] = h;
    return h;
  }

  _ambience() {
    const ctx = this.ctx;
    // wind
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.12;
    src.connect(f).connect(this.windGain).connect(this.master); src.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(f.frequency); lfo.start();
    this._nextCritter = 0;
  }

  // Called every frame with the night factor (0 day, 1 night).
  ambient(dt, night) {
    if (!this.ctx) return;
    this._nextCritter -= dt;
    if (this._nextCritter > 0) return;
    if (night > 0.6) {
      // crickets
      this._nextCritter = 0.4 + Math.random() * 1.2;
      const f = 4200 + Math.random() * 500;
      for (let i = 0; i < 3; i++) this._tone(this.master, { freq: f, dur: 0.035, gain: 0.025, when: i * 0.06 });
    } else if (night < 0.3) {
      // birds
      this._nextCritter = 2 + Math.random() * 6;
      const base = 2200 + Math.random() * 1400, n = 2 + (Math.random() * 4 | 0);
      for (let i = 0; i < n; i++) this._tone(this.master, { freq: base * (0.9 + Math.random() * 0.25), dur: 0.09, gain: 0.03, slide: 1.3 + Math.random() * 0.4, when: i * 0.12 });
    } else this._nextCritter = 2;
  }
}
