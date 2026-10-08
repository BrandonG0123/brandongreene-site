/**
 * The opening's sound, synthesised in the browser from the same clock as the
 * picture: no files, nothing to license, and every sound lands on its frame.
 * Effects only, plus a stand-in for Brandon's piano: an original phrase played
 * on a synthesised piano, quiet under everything, until he records his own.
 *
 * It plays by itself at a low level when the browser allows a page to start
 * sound; otherwise "Play with sound" starts it. "Mute" is on screen from the
 * first frame (WCAG 1.4.2). Everything runs through a shared generated reverb
 * and a compressor, so nothing clips.
 */
import { SCORE, ORDER, printWindow, threadWindow } from './score';

export interface Sound {
  /** Call from the click that turns sound on (browsers require a gesture). */
  start(): Promise<void>;
  /** Try to start without a click; calls onRunning if and when the browser allows it. */
  autoplay(onRunning: () => void): void;
  setEnabled(on: boolean): void;
  /** Advance from score time `from` to `to`. A big jump (skip, seek) plays no one-shots. */
  update(from: number, to: number): void;
  hover(): void;
  open(): void;
  /** Silence the continuous beds (the stage went off screen). */
  hush(): void;
  /**
   * The whole score rendered offline, exactly as it would play: for review
   * videos and checks, never for the page itself.
   */
  offline(duration: number, sampleRate?: number): Promise<AudioBuffer>;
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export function createSound(): Sound {
  // The live context, or an offline one while offline() renders.
  let ctx: BaseAudioContext | null = null;
  let master: GainNode, wet: GainNode, dry: GainNode;
  let noise: AudioBuffer;
  let fire: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let enabled = false;

  const build = (into?: BaseAudioContext) => {
    ctx = into ?? new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    dry = ctx.createGain();
    dry.connect(master);
    wet = ctx.createGain();
    wet.gain.value = 0.38;
    // Reverb: a generated impulse, decaying stereo noise (no file).
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.0);
    }
    verb.buffer = ir;
    wet.connect(verb).connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  };

  // ---- building blocks ------------------------------------------------------------
  const out = (node: AudioNode, reverb = 0.4, pan = 0) => {
    let src: AudioNode = node;
    if (pan) { const p = ctx!.createStereoPanner(); p.pan.value = pan; node.connect(p); src = p; }
    src.connect(dry);
    if (reverb > 0) {
      const g = ctx!.createGain();
      g.gain.value = reverb;
      src.connect(g).connect(wet);
    }
  };
  const env = (g: GainNode, at: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };
  const noiseSrc = (at: number, dur: number) => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.05);
    return s;
  };
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, peak: number, attack: number, decay: number, reverb = 0.4, pan = 0) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    env(g, at, peak, attack, decay);
    o.connect(g);
    out(g, reverb, pan);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  };
  const filtered = (type: BiquadFilterType, f0: number, f1: number, q: number, at: number, peak: number, attack: number, decay: number, reverb = 0.4, pan = 0) => {
    const s = noiseSrc(at, attack + decay), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    env(g, at, peak, attack, decay);
    s.connect(f).connect(g);
    out(g, reverb, pan);
  };

  /** A piano note: a few slightly stretched partials, a felt-hammer knock, a long fall. */
  const piano = (at: number, f: number, vel = 1) => {
    const partials = [[1, 1], [2.003, 0.42], [3.009, 0.2], [4.02, 0.09], [5.04, 0.05]];
    const decay = 4.2 * Math.pow(220 / f, 0.35);
    for (const [m, a] of partials) tone('sine', f * m, f * m, at, 0.05 * a * vel, 0.006, decay / (1 + (m - 1) * 0.6), 0.65);
    filtered('bandpass', 2400, 1800, 1.2, at, 0.012 * vel, 0.002, 0.04, 0.3);
  };

  // ---- the effects -------------------------------------------------------------------
  const fx = {
    hit(at: number) {
      // Racquet meets ball: a tight knock, the strings' ping, a little air.
      filtered('bandpass', 1900, 900, 1.4, at, 0.42, 0.002, 0.07, 0.15);
      tone('sine', 150, 70, at, 0.35, 0.003, 0.12, 0.1);
      tone('triangle', 560, 540, at, 0.08, 0.002, 0.18, 0.3);
    },
    flight(at: number, dur: number) {
      // The ball passing: air through a filter that falls as it goes by.
      filtered('bandpass', 2600, 500, 1.6, at, 0.11, dur * 0.45, dur * 0.55, 0.35);
    },
    ignite(at: number) {
      tone('sine', 95, 38, at, 0.55, 0.012, 0.6, 0.2);
      filtered('lowpass', 260, 2600, 0.8, at, 0.42, 0.06, 0.75, 0.3);
    },
    crackle(at: number, level: number) {
      filtered('highpass', 1200 + Math.random() * 3200, 900, 0.7, at, 0.06 + level * Math.random() * 0.2, 0.002, 0.012 + Math.random() * 0.03, 0.15, Math.random() * 0.6 - 0.3);
    },
    sweep(at: number, dur: number) {
      // The scan: a buzzy tone through a filter that rides up with the line.
      const o = ctx!.createOscillator(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 92;
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(380, at);
      f.frequency.exponentialRampToValueAtTime(3800, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.14, at + 0.06);
      g.gain.setValueAtTime(0.14, at + dur - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f).connect(g);
      out(g, 0.3);
      o.start(at);
      o.stop(at + dur + 0.05);
    },
    shimmer(at: number, dur: number, level = 0.08) {
      filtered('bandpass', 1800, 7500, 3, at, level, dur * 0.5, dur * 0.5, 0.6);
      for (let i = 0; i < 5; i++) {
        const f = 1600 * Math.pow(2, Math.random() * 1.6);
        tone('sine', f, f * 1.01, at + i * 0.08 + Math.random() * 0.05, 0.028, 0.08, 0.8, 0.7, Math.random() - 0.5);
      }
    },
    whoosh(at: number, dur: number, level = 0.2) {
      filtered('bandpass', 300, 2600, 1.2, at, level, dur * 0.6, dur * 0.4, 0.45);
    },
    tick(at: number, f: number, level = 0.05, pan = 0) {
      tone('square', f, f * 0.92, at, level, 0.002, 0.03, 0.12, pan);
    },
    lock(at: number, pan = 0) {
      tone('triangle', 330, 165, at, 0.16, 0.008, 0.35, 0.3, pan);
      tone('sine', 1320, 1320, at, 0.05, 0.004, 0.6, 0.6, pan);
    },
    step(at: number, f: number) {
      tone('sine', f, f, at, 0.03, 0.004, 0.5, 0.75);
    },
    chime(at: number, f: number) {
      tone('sine', f, f, at, 0.07, 0.004, 1.2, 0.8);
      tone('triangle', f * 3, f * 3, at, 0.012, 0.004, 0.45, 0.8);
    },
    chord(at: number) {
      // Self-improvement: a warm, open chord that blooms and settles.
      for (const [f, a] of [[146.83, 0.05], [220, 0.04], [293.66, 0.035], [369.99, 0.03], [440, 0.022], [659.25, 0.014]]) {
        const o = ctx!.createOscillator(), g = ctx!.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(a, at + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
        o.connect(g);
        out(g, 0.8);
        o.start(at);
        o.stop(at + 4.6);
      }
    },
  };

  // Pentatonic in D, rising: the steps and the chimes.
  const SCALE = [293.66, 329.63, 369.99, 440, 493.88];
  const note = (i: number) => SCALE[i % 5] * Math.pow(2, Math.floor(i / 5));
  // Where each piece sits left to right, for a little stereo.
  const PAN = [-0.35, 0.35, 0.6, 0.35, -0.35, -0.6];

  // ---- the score ------------------------------------------------------------------------
  const oneShots: [number, (at: number) => void][] = [];
  const add = (t: number, f: (at: number) => void) => oneShots.push([t, f]);
  add(0.06, fx.hit);
  add(0.12, (at) => fx.flight(at, 0.95));
  add(1.22, fx.ignite);
  add(SCORE.scan[0], (at) => fx.sweep(at, SCORE.scan[1] - SCORE.scan[0]));
  add(SCORE.scan[0] + 0.05, (at) => fx.shimmer(at, 0.9, 0.06));
  add(SCORE.pullBack[0], (at) => fx.whoosh(at, 1.1, 0.16));
  ORDER.forEach((_, k) => {
    const [a, b] = printWindow(k);
    for (let i = 0; i < 9; i++) add(a + ((i + 0.5) / 9) * (b - a), (at) => fx.tick(at, 1700 + i * 70 + k * 40, 0.035, PAN[k]));
    add(b, (at) => fx.lock(at, PAN[k]));
    const [ta] = threadWindow(k);
    add(ta, (at) => fx.shimmer(at, 0.6, 0.035));
  });
  for (let i = 0; i < 11; i++) add(SCORE.stepsLit[0] + (i / 11) * (SCORE.stepsLit[1] - SCORE.stepsLit[0]), (at) => fx.step(at, note(i + 3)));
  add(SCORE.centreLabel + 0.05, fx.chord);
  [0, 1, 2, 3].forEach((i) => add(SCORE.open + 0.15 + i * 0.12, (at) => fx.chime(at, note(5 + i))));
  // The piano stand-in: an original phrase in D, sparse, under everything.
  const PIANO: [number, number[]][] = [
    [0.1, [146.83, 220]], [1.2, [369.99]], [2.05, [329.63]], [2.7, [110, 329.63]],
    [3.85, [123.47, 293.66, 369.99]], [5.0, [440]], [5.65, [369.99]], [6.35, [392]],
    [7.0, [440]], [7.5, [493.88]], [8.0, [73.42, 146.83, 220, 369.99, 587.33]], [9.95, [293.66, 440]],
  ];
  for (const [t, fs] of PIANO) add(t, (at) => fs.forEach((f, i) => piano(at + i * 0.018, f, 0.9)));
  oneShots.sort((a, b) => a[0] - b[0]);

  const fireLevel = (t: number) => {
    const up = Math.max(0, Math.min(1, (t - 1.22) / 0.45));
    const down = 1 - Math.max(0, Math.min(1, (t - SCORE.scan[0]) / (SCORE.scan[1] - SCORE.scan[0])));
    return up * down;
  };

  const startBed = () => {
    if (!ctx || fire) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(lp).connect(g);
    out(g, 0.25);
    src.start();
    fire = { src, gain: g };
  };

  const session = () => {
    // On iPhone and iPad, Web Audio obeys the ring/silent switch unless the
    // page declares it is playback (like a video). Safari 17+.
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) s.type = 'playback';
  };

  return {
    autoplay(onRunning) {
      session();
      if (!ctx) build();
      const check = () => { if (ctx?.state === 'running') { startBed(); onRunning(); return true; } return false; };
      if (check()) return;
      const live = ctx as AudioContext;
      live.addEventListener('statechange', function once() {
        if (check()) live.removeEventListener('statechange', once);
      });
      live.resume().catch(() => { /* blocked until the reader interacts */ });
    },
    async start() {
      session();
      if (!ctx) build();
      if (ctx!.state !== 'running') await (ctx as AudioContext).resume();
      startBed();
    },
    setEnabled(on) {
      enabled = on;
      if (!ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      // Deliberately quiet: this is a page, not a trailer.
      master.gain.setTargetAtTime(on ? 0.35 : 0, now, 0.05);
    },
    update(from, to) {
      if (!ctx || !enabled) return;
      const now = ctx.currentTime;
      const jump = to - from > 0.35 || to < from;
      if (!jump) for (const [t, f] of oneShots) if (t > from && t <= to) f(now + 0.005);
      const a = fireLevel(to);
      fire?.gain.gain.setTargetAtTime(a * 0.4, now, 0.06);
      if (!jump && a > 0.05) {
        const count = Math.random() < a * (to - from) * 38 ? 1 + Math.floor(Math.random() * 2) : 0;
        for (let i = 0; i < count; i++) fx.crackle(now + Math.random() * 0.015, a);
      }
    },
    hover() {
      if (ctx && enabled) fx.tick(ctx.currentTime, 2200, 0.035);
    },
    open() {
      if (!ctx || !enabled) return;
      [0, 1, 2].forEach((i) => fx.chime(ctx!.currentTime + i * 0.06, note(6 + i)));
    },
    hush() {
      if (ctx) fire?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    suspend() { (ctx as AudioContext | null)?.suspend(); },
    resume() { if (enabled) (ctx as AudioContext | null)?.resume(); },
    dispose() { fire?.src.stop(); fire = null; (ctx as AudioContext | null)?.close(); ctx = null; },
    async offline(duration, sampleRate = 48000) {
      const live = ctx, liveFire = fire;
      const off = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
      build(off);
      fire = null;
      master.gain.value = 0.35;
      startBed();
      // The fire bed follows the picture; crackles come as they would per frame.
      const curve = new Float32Array(Math.ceil(duration * 60));
      for (let i = 0; i < curve.length; i++) curve[i] = fireLevel(i / 60) * 0.4 + 1e-4;
      fire!.gain.gain.setValueCurveAtTime(curve, 0, duration);
      for (let t = 0; t < duration; t += 1 / 60) {
        const a = fireLevel(t);
        if (a > 0.05 && Math.random() < a * (1 / 60) * 38) fx.crackle(t + Math.random() * 0.015, a);
      }
      for (const [t, f] of oneShots) if (t < duration) f(t + 0.005);
      const buf = await off.startRendering();
      ctx = live; fire = liveFire;
      return buf;
    },
  };
}
