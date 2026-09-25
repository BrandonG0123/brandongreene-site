// Sound and speech while scanning.
//
// The phone is pointed at a foot at arm's length, often held by someone else,
// so nobody is reading the screen. A click when a photo is kept, a chime when
// an angle is finished, and short spoken directions ("go right", "higher") do
// more than any on-screen text.
//
// Everything here is optional and defensive: no Web Audio, no speech, or a
// browser that refuses either, and scanning carries on unchanged. Audio can
// only start from a tap, so start() is called from the Start button.

const STORE = "footscan.cues";

/**
 * Call synchronously inside a tap handler. iOS only lets audio and speech
 * begin from a user gesture; this opens both so later cues can play even
 * though scanning starts by itself, without a second tap.
 */
export function unlockAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (AC && !globalThis.__footscanAudio) {
    try { globalThis.__footscanAudio = new AC(); } catch { /* no audio */ }
  }
  globalThis.__footscanAudio?.resume?.().catch(() => {});
  try {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    globalThis.speechSynthesis?.speak(silent);
  } catch { /* no speech */ }
}

export class Cues {
  constructor() {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; }
    })();
    this.enabled = saved?.enabled ?? true;
    this.voice = saved?.voice ?? true;
    this.ctx = null;
    this.lastSaid = "";
    this.lastSaidAt = 0;
  }

  save() {
    try { localStorage.setItem(STORE, JSON.stringify({ enabled: this.enabled, voice: this.voice })); } catch { /* ignore */ }
  }

  /** Call from a click/tap: browsers only allow audio to begin from a gesture. */
  start() {
    if (!this.enabled || this.ctx) return;
    // Reuse the context opened by unlockAudio() during the tap, if any.
    this.ctx = globalThis.__footscanAudio ?? null;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!this.ctx && AC) {
      try { this.ctx = new AC(); } catch { this.ctx = null; }
    }
    this.ctx?.resume?.().catch(() => {});
  }

  stop() {
    // Keep the shared context: closing it would silence the next scan.
    if (this.ctx && this.ctx !== globalThis.__footscanAudio) this.ctx.close?.().catch(() => {});
    this.ctx = null;
    globalThis.speechSynthesis?.cancel?.();
  }

  beep(frequency, seconds, gain = 0.05) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const osc = this.ctx.createOscillator();
    const vol = this.ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    // A short ramp instead of a hard stop: a square edge clicks unpleasantly.
    vol.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(gain, this.ctx.currentTime + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + seconds);
    osc.connect(vol).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + seconds + 0.02);
  }

  /** One photo kept. */
  shutter() {
    this.beep(880, 0.05, 0.03);
  }

  /** An angle is now covered. */
  cellDone() {
    this.beep(660, 0.09, 0.05);
    setTimeout(() => this.beep(990, 0.12, 0.05), 90);
  }

  /** Everything needed is captured. */
  complete() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 0.06), i * 130));
  }

  /** Something is wrong (too dark, mat lost). Low and short, not alarming. */
  problem() {
    this.beep(320, 0.12, 0.04);
  }

  /**
   * Speak a direction. Repeats are suppressed, and the same phrase is not
   * repeated for a few seconds, so it doesn't chatter.
   */
  say(text, { minGapMs = 2600 } = {}) {
    if (!this.enabled || !this.voice || !text) return;
    const synth = globalThis.speechSynthesis;
    if (!synth) return;
    const now = Date.now();
    if (text === this.lastSaid && now - this.lastSaidAt < minGapMs) return;
    if (now - this.lastSaidAt < 900) return; // never talk over itself
    this.lastSaid = text;
    this.lastSaidAt = now;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.volume = 0.9;
      synth.cancel();
      synth.speak(utter);
    } catch { /* speech unavailable: the screen still shows everything */ }
  }
}

/** Keeps the screen on while scanning, where the browser allows it. */
export class ScreenAwake {
  async acquire() {
    try {
      this.lock = await navigator.wakeLock?.request("screen");
      this.onVisible ??= () => {
        if (document.visibilityState === "visible" && this.lock?.released !== false) this.acquire();
      };
      document.addEventListener("visibilitychange", this.onVisible);
    } catch { /* not supported, or denied: the screen may dim */ }
  }

  release() {
    try { this.lock?.release(); } catch { /* ignore */ }
    this.lock = null;
    if (this.onVisible) document.removeEventListener("visibilitychange", this.onVisible);
  }
}
