/* Audio.js — everything you hear is synthesised at runtime. No asset files.

   Structure:
     master -> compressor -> destination
       sfxBus   (positional-ish: we just pan/attenuate by screen offset)
       musicBus (layered ambient loops built from scheduled notes)
*/

import { CFG } from './Config.js';
import { clamp, rng } from './Util.js';

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: CFG.audio.master, sfx: CFG.audio.sfx, music: CFG.audio.music };
    this._music = null;
    this._lastPlay = new Map();     // throttle identical sfx in the same frame
    this._noiseBuf = null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(this.comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.vol.music;
    this.musicBus.connect(this.master);

    // A gentle plate-ish reverb built from decaying noise.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.1, 2.6);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.22;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.master);

    this.ready = true;
  }

  setVolume(which, v) {
    this.vol[which] = clamp(v, 0, 1);
    if (!this.ready) return;
    ({ master: this.master, sfx: this.sfxBus, music: this.musicBus })[which]
      ?.gain.setTargetAtTime(this.vol[which], this.ctx.currentTime, 0.05);
  }

  /* ------------------------------------------------------------ buffers */

  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx, n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _impulse(dur, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  /* --------------------------------------------------------- primitives */

  /** A pitched blip. */
  tone(o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const f0 = o.freq || 440, f1 = o.freq2 ?? f0;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (o.dur || 0.2));

    const g = ctx.createGain();
    const peak = (o.gain ?? 0.3);
    const atk = o.attack ?? 0.006, dur = o.dur ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.cutoff || 1200; f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.bus || this.sfxBus);
    if (o.verb) g.connect(this.verbSend);
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1);
      g.disconnect(); g.connect(p); p.connect(o.bus || this.sfxBus);
      if (o.verb) p.connect(this.verbSend);
    }
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** A burst of filtered noise — impacts, whooshes, fire. */
  noise(o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this._noise();
    src.loop = true;
    src.playbackRate.value = o.rate || 1;

    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.cutoff || 1400, t);
    if (o.cutoff2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff2), t + (o.dur || 0.2));
    f.Q.value = o.q ?? 1.1;

    const g = ctx.createGain();
    const dur = o.dur ?? 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f); f.connect(g);
    let out = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p); out = p;
    }
    out.connect(o.bus || this.sfxBus);
    if (o.verb) out.connect(this.verbSend);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* -------------------------------------------------------------- sfx */

  /** Named sound effects. `pan` is -1..1 from the screen-space x of the source. */
  play(name, opt = {}) {
    if (!this.ready) return;
    // de-dupe: at most N of the same sound per 40 ms, so a 20-unit volley
    // does not turn into a wall of white noise.
    const now = performance.now();
    const last = this._lastPlay.get(name) || 0;
    if (now - last < 32) return;
    this._lastPlay.set(name, now);

    const pan = opt.pan ?? 0, v = opt.vol ?? 1;
    const P = { pan, verb: opt.verb };

    switch (name) {
      /* --- UI ------------------------------------------------------- */
      case 'ui.hover': this.tone({ freq: 880, freq2: 940, dur: 0.05, gain: 0.05, type: 'triangle', ...P }); break;
      case 'ui.click': this.tone({ freq: 620, freq2: 420, dur: 0.09, gain: 0.13, type: 'square', filter: 'lowpass', cutoff: 2400, ...P }); break;
      case 'ui.back': this.tone({ freq: 400, freq2: 260, dur: 0.11, gain: 0.12, type: 'triangle', ...P }); break;
      case 'ui.deny': this.tone({ freq: 190, freq2: 130, dur: 0.16, gain: 0.18, type: 'sawtooth', filter: 'lowpass', cutoff: 800, ...P }); break;
      case 'ui.open':
        this.tone({ freq: 330, freq2: 660, dur: 0.26, gain: 0.1, type: 'triangle', verb: true, ...P });
        this.noise({ cutoff: 2600, cutoff2: 700, dur: 0.3, gain: 0.05, ...P });
        break;

      /* --- economy -------------------------------------------------- */
      case 'coin':
        for (let i = 0; i < 3; i++)
          this.tone({ freq: 1180 + i * 240, dur: 0.14, gain: 0.08 * v, type: 'triangle', delay: i * 0.035, verb: true, ...P });
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.42, gain: 0.12 * v, type: 'triangle', delay: i * 0.075, verb: true, ...P }));
        this.noise({ cutoff: 400, cutoff2: 5200, dur: 0.5, gain: 0.05, filter: 'bandpass', ...P });
        break;
      case 'craft':
        this.noise({ cutoff: 3000, cutoff2: 500, dur: 0.22, gain: 0.2 * v, q: 0.6, ...P });
        this.tone({ freq: 210, freq2: 140, dur: 0.3, gain: 0.16 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 900, ...P });
        break;
      case 'unlock':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.7, gain: 0.1 * v, type: 'sine', delay: i * 0.06, verb: true, ...P }));
        break;
      case 'levelup':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.85, gain: 0.11 * v, type: 'triangle', delay: i * 0.07, verb: true, ...P }));
        break;

      /* --- melee ---------------------------------------------------- */
      case 'swing':
        this.noise({ cutoff: 900, cutoff2: 2600, dur: 0.13, gain: 0.12 * v, q: 0.8, ...P }); break;
      case 'hit.flesh':
        this.noise({ cutoff: 420, cutoff2: 140, dur: 0.14, gain: 0.26 * v, filter: 'lowpass', q: 0.7, ...P });
        this.tone({ freq: 130, freq2: 70, dur: 0.11, gain: 0.14 * v, type: 'sine', ...P });
        break;
      case 'hit.metal':
        this.tone({ freq: 2100 + rng.range(-160, 160), freq2: 900, dur: 0.2, gain: 0.14 * v, type: 'square', filter: 'bandpass', cutoff: 2600, q: 5, verb: true, ...P });
        this.noise({ cutoff: 4200, cutoff2: 1200, dur: 0.12, gain: 0.14 * v, ...P });
        break;
      case 'hit.stone':
        this.noise({ cutoff: 700, cutoff2: 200, dur: 0.24, gain: 0.26 * v, filter: 'lowpass', ...P });
        this.tone({ freq: 90, freq2: 52, dur: 0.24, gain: 0.2 * v, type: 'sine', ...P });
        break;
      case 'block':
        this.tone({ freq: 1500, freq2: 620, dur: 0.16, gain: 0.18 * v, type: 'square', filter: 'bandpass', cutoff: 1800, q: 7, verb: true, ...P });
        break;

      /* --- ranged --------------------------------------------------- */
      case 'bow':
        this.noise({ cutoff: 2200, cutoff2: 5200, dur: 0.1, gain: 0.13 * v, q: 1.4, ...P });
        this.tone({ freq: 240, freq2: 640, dur: 0.09, gain: 0.07 * v, type: 'triangle', ...P });
        break;
      case 'arrow.hit':
        this.noise({ cutoff: 1800, cutoff2: 520, dur: 0.1, gain: 0.16 * v, ...P }); break;
      case 'crossbow':
        this.noise({ cutoff: 1400, cutoff2: 3600, dur: 0.07, gain: 0.18 * v, q: 2.4, ...P });
        this.tone({ freq: 180, freq2: 90, dur: 0.1, gain: 0.1 * v, type: 'square', ...P });
        break;

      /* --- magic ---------------------------------------------------- */
      case 'cast':
        this.tone({ freq: 420, freq2: 1180, dur: 0.34, gain: 0.11 * v, type: 'sine', verb: true, ...P });
        this.noise({ cutoff: 800, cutoff2: 4800, dur: 0.34, gain: 0.05 * v, ...P });
        break;
      case 'arcane.hit':
        this.tone({ freq: 880, freq2: 210, dur: 0.3, gain: 0.16 * v, type: 'sine', verb: true, ...P });
        this.tone({ freq: 1320, freq2: 320, dur: 0.24, gain: 0.08 * v, type: 'triangle', ...P });
        break;
      case 'fire':
        this.noise({ cutoff: 620, cutoff2: 180, dur: 0.6, gain: 0.2 * v, filter: 'lowpass', q: 0.5, verb: true, ...P });
        this.tone({ freq: 110, freq2: 46, dur: 0.5, gain: 0.2 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 420, ...P });
        break;
      case 'frost':
        this.tone({ freq: 2600, freq2: 1100, dur: 0.42, gain: 0.1 * v, type: 'sine', verb: true, ...P });
        this.noise({ cutoff: 5200, cutoff2: 2200, dur: 0.4, gain: 0.08 * v, q: 2.2, ...P });
        break;
      case 'holy':
        [660, 990, 1320].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.9, gain: 0.08 * v, type: 'sine', delay: i * 0.05, verb: true, ...P }));
        break;
      case 'shadow':
        this.tone({ freq: 160, freq2: 62, dur: 0.7, gain: 0.16 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 480, verb: true, ...P });
        this.noise({ cutoff: 280, cutoff2: 90, dur: 0.7, gain: 0.1 * v, filter: 'lowpass', ...P });
        break;
      case 'heal':
        [784, 1047, 1319].forEach((f, i) =>
          this.tone({ freq: f, freq2: f * 1.5, dur: 0.6, gain: 0.07 * v, type: 'sine', delay: i * 0.055, verb: true, ...P }));
        break;
      case 'lightning':
        this.noise({ cutoff: 6000, cutoff2: 900, dur: 0.3, gain: 0.26 * v, q: 0.6, verb: true, ...P });
        this.tone({ freq: 3200, freq2: 240, dur: 0.16, gain: 0.12 * v, type: 'square', ...P });
        break;

      /* --- units & field -------------------------------------------- */
      case 'deploy':
        this.tone({ freq: 300, freq2: 520, dur: 0.24, gain: 0.14 * v, type: 'triangle', verb: true, ...P });
        this.noise({ cutoff: 900, cutoff2: 260, dur: 0.3, gain: 0.1 * v, filter: 'lowpass', ...P });
        break;
      case 'die':
        this.tone({ freq: 240, freq2: 70, dur: 0.4, gain: 0.13 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 700, ...P });
        break;
      case 'die.big':
        this.tone({ freq: 120, freq2: 34, dur: 0.9, gain: 0.26 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 420, verb: true, ...P });
        this.noise({ cutoff: 500, cutoff2: 90, dur: 1.0, gain: 0.2 * v, filter: 'lowpass', ...P });
        break;
      case 'stomp':
        this.tone({ freq: 74, freq2: 32, dur: 0.6, gain: 0.34 * v, type: 'sine', verb: true, ...P });
        this.noise({ cutoff: 340, cutoff2: 80, dur: 0.5, gain: 0.2 * v, filter: 'lowpass', ...P });
        break;
      case 'structure.down':
        this.noise({ cutoff: 800, cutoff2: 70, dur: 1.5, gain: 0.34 * v, filter: 'lowpass', verb: true, ...P });
        this.tone({ freq: 90, freq2: 26, dur: 1.4, gain: 0.3 * v, type: 'sine', verb: true, ...P });
        break;
      case 'capture':
        [523, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.6, gain: 0.1 * v, type: 'triangle', delay: i * 0.1, verb: true, ...P }));
        break;
      case 'horn':
        [147, 220, 294].forEach((f, i) =>
          this.tone({ freq: f, dur: 1.5, gain: 0.13 * v, type: 'sawtooth', filter: 'lowpass', cutoff: 700, q: 2, delay: i * 0.02, verb: true, ...P }));
        break;

      /* --- verdicts ------------------------------------------------- */
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone({ freq: f, dur: 1.6, gain: 0.12, type: 'triangle', delay: i * 0.11, verb: true }));
        this.play('horn', { vol: 0.8 });
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) =>
          this.tone({ freq: f, dur: 1.5, gain: 0.13, type: 'sine', delay: i * 0.22, verb: true }));
        break;

      /* --- world ---------------------------------------------------- */
      case 'door':
        this.noise({ cutoff: 300, cutoff2: 90, dur: 0.8, gain: 0.16, filter: 'lowpass', verb: true, ...P });
        break;
      case 'page':
        this.noise({ cutoff: 3600, cutoff2: 1400, dur: 0.17, gain: 0.1, q: 0.8, ...P }); break;
      case 'bubble':
        this.tone({ freq: rng.range(300, 620), freq2: rng.range(700, 1200), dur: 0.14, gain: 0.05, type: 'sine', ...P }); break;
      case 'anvil':
        this.tone({ freq: 1800, freq2: 780, dur: 0.5, gain: 0.16, type: 'square', filter: 'bandpass', cutoff: 2200, q: 8, verb: true, ...P });
        this.noise({ cutoff: 3600, cutoff2: 800, dur: 0.16, gain: 0.14, ...P });
        break;
    }
  }

  /* ------------------------------------------------------------- music */

  /**
   * Layered ambient music. `mood` picks a scale and instrumentation; layers
   * fade rather than cut, so entering a battle from the hub is seamless.
   */
  setMusic(mood) {
    if (!this.ready) return;
    if (this._music && this._music.mood === mood) return;
    if (this._music) this._stopMusic();
    if (!mood) return;

    const M = MOODS[mood];
    if (!M) return;

    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.6);
    gain.connect(this.musicBus);

    const state = { mood, gain, timer: null, step: 0, M };
    this._music = state;

    const beat = 60 / M.bpm;
    const schedule = () => {
      if (this._music !== state) return;
      const t = ctx.currentTime;
      const i = state.step++;

      // bass pulse on every bar
      if (i % 4 === 0) {
        const root = M.root * Math.pow(2, (M.prog[(i / 4) % M.prog.length]) / 12);
        this._musNote(root / 2, beat * 3.6, 0.14, 'sine', gain, t);
        this._musNote(root / 4, beat * 3.8, 0.10, 'triangle', gain, t);
      }
      // pad chord
      if (i % 2 === 0) {
        const root = M.root * Math.pow(2, (M.prog[Math.floor(i / 4) % M.prog.length]) / 12);
        for (const iv of M.chord) this._musNote(root * Math.pow(2, iv / 12), beat * 2.2, 0.045, M.padWave, gain, t + rng.range(0, 0.04));
      }
      // melody, sparse and slightly random so it never loops audibly
      if (rng.chance(M.melodyChance)) {
        const deg = M.scale[rng.int(0, M.scale.length - 1)];
        const oct = rng.chance(0.28) ? 2 : 1;
        this._musNote(M.root * oct * Math.pow(2, deg / 12), beat * rng.range(0.6, 1.6), 0.05, M.leadWave, gain, t + rng.range(0, 0.06), true);
      }
      state.timer = setTimeout(schedule, beat * 1000);
    };
    schedule();
  }

  _musNote(freq, dur, g, wave, out, t, verb) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = wave; osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(g, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.6;
    osc.connect(f); f.connect(env); env.connect(out);
    if (verb) env.connect(this.verbSend);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  _stopMusic() {
    const m = this._music;
    if (!m) return;
    this._music = null;
    clearTimeout(m.timer);
    try {
      m.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      m.gain.gain.setValueAtTime(m.gain.gain.value, this.ctx.currentTime);
      m.gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.6);
      setTimeout(() => { try { m.gain.disconnect(); } catch (e) { /* already gone */ } }, 2000);
    } catch (e) { /* context may be closed */ }
  }
}

/* Minor-mode moods. `prog` is semitone offsets of the root per bar. */
const MOODS = {
  hub:     { bpm: 62, root: 174.6, prog: [0, -3, -5, -3], chord: [0, 7, 12, 15], scale: [0, 2, 3, 5, 7, 8, 10, 12], padWave: 'sine', leadWave: 'triangle', melodyChance: 0.3 },
  library: { bpm: 52, root: 196.0, prog: [0, 5, 3, -2], chord: [0, 7, 11, 14], scale: [0, 2, 4, 5, 7, 9, 11, 12], padWave: 'sine', leadWave: 'sine', melodyChance: 0.22 },
  forge:   { bpm: 76, root: 146.8, prog: [0, 0, -4, -2], chord: [0, 7, 10], chordAlt: [0, 5], scale: [0, 3, 5, 6, 7, 10, 12], padWave: 'triangle', leadWave: 'square', melodyChance: 0.2 },
  map:     { bpm: 68, root: 164.8, prog: [0, -2, -5, -7], chord: [0, 7, 12], scale: [0, 2, 3, 7, 8, 10, 12], padWave: 'sine', leadWave: 'triangle', melodyChance: 0.26 },
  battle:  { bpm: 104, root: 138.6, prog: [0, 0, -3, -5], chord: [0, 7, 12, 14], scale: [0, 1, 3, 5, 7, 8, 11, 12], padWave: 'sawtooth', leadWave: 'square', melodyChance: 0.34 },
  boss:    { bpm: 118, root: 123.5, prog: [0, -1, -6, -3], chord: [0, 6, 11, 13], scale: [0, 1, 4, 6, 7, 10, 13], padWave: 'sawtooth', leadWave: 'sawtooth', melodyChance: 0.42 },
  victory: { bpm: 92, root: 196.0, prog: [0, 4, 7, 5], chord: [0, 4, 7, 12], scale: [0, 2, 4, 5, 7, 9, 11, 12], padWave: 'triangle', leadWave: 'triangle', melodyChance: 0.4 },
};

export const audio = new AudioSystem();

/** Screen-space pan helper: give it a world x relative to camera-right. */
export const panFor = (screenX) => clamp((screenX / innerWidth) * 2 - 1, -1, 1) * 0.7;
