/**
 * The intro's sound, synthesised in the browser: no files, nothing to license,
 * and every sound lands exactly on the picture because it is driven by the same
 * clock. Effects only, no words.
 *
 * Sound never starts on its own (browsers forbid it, and it would be rude):
 * the reader presses "Play with sound". Each effect is built from noise or
 * oscillators, shaped by filters and envelopes, and sent through a shared
 * generated reverb and a compressor so nothing clips.
 */

export interface Cues {
  pace: number;                  // score seconds per real second
  ignite: number;
  burnDur: number;
  shimmer: number;               // embers cooling into points
  knight: number;                // knight fully formed
  print: { start: number; spread: number; dur: number; layers: number };
  scan: [number, number];
  network: number;
  wave: [number, number];
  layerX: number[];              // where the signal crosses each network layer, 0–1 of the wave
  gyroid: number;
  eq: [number, number];
  eqChars: number;
  explode: number;
  land: number;                  // first piece lands
  end: number;
  activity(t: number): number;   // how much is burning, 0–1
}

export interface Sound {
  /** Call from the click that turns sound on (browsers require a gesture). */
  start(): Promise<void>;
  setEnabled(on: boolean): void;
  /** Advance from score time `from` to `to`. A big jump (skip, seek) plays no one-shots. */
  update(from: number, to: number): void;
  hover(): void;
  /** Silence the continuous beds (the stage went off screen). */
  hush(): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export function createSound(c: Cues): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode, wet: GainNode, dry: GainNode;
  let noise: AudioBuffer;
  let roar: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let pad: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  let enabled = false;

  const real = (score: number) => score / c.pace; // score seconds → real seconds

  const build = () => {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    dry = ctx.createGain();
    dry.connect(master);
    wet = ctx.createGain();
    wet.gain.value = 0.35;
    // Reverb: a generated impulse, decaying stereo noise (no file).
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    wet.connect(verb).connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  };

  // ---- building blocks ----------------------------------------------------------
  const out = (node: AudioNode, reverb = 0.4) => {
    node.connect(dry);
    if (reverb > 0) {
      const g = ctx!.createGain();
      g.gain.value = reverb;
      node.connect(g).connect(wet);
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
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, peak: number, attack: number, decay: number, reverb = 0.4) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    env(g, at, peak, attack, decay);
    o.connect(g);
    out(g, reverb);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  };
  const filteredNoise = (type: BiquadFilterType, f0: number, f1: number, q: number, at: number, peak: number, attack: number, decay: number, reverb = 0.4) => {
    const s = noiseSrc(at, attack + decay), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    env(g, at, peak, attack, decay);
    s.connect(f).connect(g);
    out(g, reverb);
  };

  // ---- the effects ----------------------------------------------------------------
  const fx = {
    ignite(at: number) {
      // The whoomph of catching: a low thump under a burst of air opening up.
      tone('sine', 95, 38, at, 0.55, 0.012, 0.55, 0.2);
      filteredNoise('lowpass', 260, 2400, 0.8, at, 0.4, 0.06, 0.7, 0.3);
    },
    crackle(at: number, level: number) {
      filteredNoise('highpass', 1200 + Math.random() * 3200, 900, 0.7, at, 0.06 + level * Math.random() * 0.22, 0.002, 0.012 + Math.random() * 0.03, 0.15);
    },
    shimmer(at: number) {
      // Embers cooling into points: a rising airy sweep with glassy partials.
      filteredNoise('bandpass', 1800, 7500, 3, at, 0.09, 0.5, real(1.0), 0.6);
      for (let i = 0; i < 6; i++) {
        const f = 1600 * Math.pow(2, Math.random() * 1.6);
        tone('sine', f, f * 1.01, at + i * 0.09 + Math.random() * 0.05, 0.035, 0.08, 0.9, 0.7);
      }
    },
    lock(at: number) {
      // A shape snapping into being: a dropping body tone and a bright ping.
      tone('triangle', 330, 165, at, 0.3, 0.008, 0.4, 0.3);
      tone('sine', 1320, 1320, at, 0.1, 0.004, 0.7, 0.6);
    },
    tick(at: number, f = 2400, level = 0.09) {
      tone('square', f, f * 0.9, at, level, 0.002, 0.03, 0.1);
    },
    sweep(at: number, dur: number) {
      // The scan line: a buzzy tone through a filter that rides up with it.
      const o = ctx!.createOscillator(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 92;
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(380, at);
      f.frequency.exponentialRampToValueAtTime(3600, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.05);
      g.gain.setValueAtTime(0.16, at + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f).connect(g);
      out(g, 0.3);
      o.start(at);
      o.stop(at + dur + 0.05);
    },
    whoosh(at: number, dur: number, level = 0.22) {
      filteredNoise('bandpass', 300, 2600, 1.2, at, level, dur * 0.6, dur * 0.4, 0.4);
    },
    note(at: number, f: number) {
      tone('sine', f, f, at, 0.12, 0.005, 0.55, 0.6);
      tone('sine', f * 2, f * 2, at, 0.03, 0.005, 0.3, 0.6);
    },
    boom(at: number) {
      // The explosion: sub drop, a wide burst of air, and a long tail.
      tone('sine', 72, 26, at, 0.7, 0.01, 1.4, 0.4);
      filteredNoise('lowpass', 5200, 220, 0.6, at, 0.42, 0.015, 1.3, 0.7);
      filteredNoise('highpass', 2500, 7000, 0.7, at, 0.08, 0.01, 0.5, 0.8);
    },
    chime(at: number, f: number) {
      tone('sine', f, f, at, 0.09, 0.004, 1.3, 0.8);
      tone('triangle', f * 3, f * 3, at, 0.015, 0.004, 0.5, 0.8);
    },
  };

  // Notes for the network's layers and the landing pieces: an open, bright
  // scale (D major pentatonic), rising.
  const NET_NOTES = [587.3, 739.99, 880, 1174.66];
  const LAND_NOTES = [587.3, 659.26, 739.99, 880, 987.77];

  const startBeds = () => {
    if (!ctx || roar) return;
    // Fire: band-limited noise whose level follows the flames.
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
    roar = { src, gain: g };
    // A low bed under everything, so the effects sit in a space rather than silence.
    const pg = ctx.createGain();
    pg.gain.value = 0;
    const oscs = [55, 82.41, 110.3].map((f) => {
      const o = ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(pg);
      o.start();
      return o;
    });
    out(pg, 0.6);
    pad = { oscs, gain: pg };
  };
  const stopBeds = () => {
    roar?.src.stop(); roar = null;
    pad?.oscs.forEach((o) => o.stop()); pad = null;
  };

  // Each one-shot, keyed to its score time.
  const oneShots: [number, (at: number) => void][] = [];
  const add = (t: number, f: (at: number) => void) => oneShots.push([t, f]);
  add(c.ignite, fx.ignite);
  add(c.shimmer, fx.shimmer);
  // Every transition is announced by the points' rush, then a lock as the shape lands.
  add(c.knight - 1.0, (at) => fx.whoosh(at, real(1.0), 0.2));
  add(c.knight, fx.lock);
  add(c.print.start, (at) => fx.whoosh(at, real(c.print.spread + c.print.dur), 0.14));
  for (let k = 0; k < c.print.layers; k++) {
    add(c.print.start + (k / c.print.layers) * c.print.spread + c.print.dur * 0.85, (at) => fx.tick(at, 1800 + k * 60, 0.07));
  }
  add(c.print.start + c.print.spread + c.print.dur, fx.lock);
  add(c.scan[0], (at) => fx.sweep(at, real(c.scan[1] - c.scan[0])));
  add(c.network, (at) => fx.whoosh(at, real(0.8), 0.2));
  add(c.network + 1.05, fx.lock);
  c.layerX.forEach((x, l) => add(c.wave[0] + x * (c.wave[1] - c.wave[0]), (at) => fx.note(at, NET_NOTES[l % NET_NOTES.length])));
  add(c.gyroid, (at) => fx.whoosh(at, real(0.9), 0.2));
  add(c.gyroid + 1.2, fx.lock);
  for (let i = 0; i < c.eqChars; i += 2) add(c.eq[0] + (i / c.eqChars) * (c.eq[1] - c.eq[0]), (at) => fx.tick(at, 3200 + Math.random() * 600, 0.035));
  add(c.explode, fx.boom);
  LAND_NOTES.forEach((f, i) => add(c.land + i * 0.07 * c.pace, (at) => fx.chime(at, f)));
  oneShots.sort((a, b) => a[0] - b[0]);

  return {
    async start() {
      if (!ctx) build();
      if (ctx!.state !== 'running') await ctx!.resume();
      startBeds();
    },
    setEnabled(on) {
      enabled = on;
      if (!ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.05);
    },
    update(from, to) {
      if (!ctx || !enabled) return;
      const now = ctx.currentTime;
      const jump = to - from > 0.35 * c.pace || to < from;
      if (!jump) for (const [t, f] of oneShots) if (t > from && t <= to) f(now + 0.005);
      // Beds follow the picture every frame.
      const a = c.activity(to);
      roar?.gain.gain.setTargetAtTime(a * 0.42, now, 0.06);
      if (!jump && a > 0.05) {
        const dt = real(to - from);
        const count = Math.random() < a * dt * 38 ? 1 + Math.floor(Math.random() * 2) : 0;
        for (let i = 0; i < count; i++) fx.crackle(now + Math.random() * 0.015, a);
      }
      const bed = to < c.end ? Math.min(1, to / 0.6) * 0.018 : 0.0;
      pad?.gain.gain.setTargetAtTime(bed, now, 0.4);
    },
    hover() {
      if (!ctx || !enabled) return;
      fx.tick(ctx.currentTime, 2200, 0.05);
    },
    hush() {
      if (!ctx) return;
      roar?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      pad?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    },
    suspend() { ctx?.suspend(); },
    resume() { if (enabled) ctx?.resume(); },
    dispose() { stopBeds(); ctx?.close(); ctx = null; },
  };
}
