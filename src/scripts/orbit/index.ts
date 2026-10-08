/**
 * The About opening, "Orbit": a real tennis ball takes the hit, catches fire
 * and is scanned into points (the opening video, rendered offline); the points
 * print the six things Brandon is about round a ring; threads of light carry
 * them back to the centre, self-improvement; then the ring is the page's
 * navigation.
 *
 * This module is the conductor. One clock: while the opening video plays, its
 * currentTime is the clock (so the live points peel off exactly where the
 * video's scan line is); after that, the frame clock. The look lives in
 * scene.ts and the modules it names; the timing in score.ts.
 *
 * Rules it keeps (CONTRIBUTING.md, "Motion and 3D"):
 *  - plays once per visit; Skip is first in the tab order; any key, wheel,
 *    touch or click on the stage skips to the end, so the reader is never held
 *  - once it settles, only the staircase at the centre turns, slowly; every
 *    other movement answers the reader (lean, hover, focus, tap)
 *  - the categories and their items are real links; the canvas is decoration
 *  - stops drawing when off screen or in a hidden tab
 */
import { createScene, type OrbitScene } from './scene';
import { createSound } from './sound';
import { SCORE, ORDER, printWindow } from './score';

export interface OrbitHandle {
  skip(): void;
  replay(): void;
  /**
   * Hold the opening at a moment (score seconds); for the stills script and
   * tests. With `dt`, step there from the last moment instead (frame by frame
   * for review videos), so the open and turn ease as they do live.
   */
  seek(t: number, dt?: number): Promise<void>;
  /** The sound score rendered offline (review videos), as [left, right] samples. */
  soundtrack(duration: number): Promise<{ sampleRate: number; channels: Float32Array[] }>;
  dispose(): void;
}

interface Options {
  /** Start already settled (a return visit within the session). */
  settled?: boolean;
  /**
   * Offline capture: keep the drawing buffer, never start the clock. With
   * `isolate`, draw one piece (or the centre) alone for the stills.
   */
  capture?: boolean | { isolate?: 'tennis' | 'school' | 'projects' | 'coding' | 'hobbies' | 'mind' | 'centre'; film?: boolean };
}

const TENNIS = ORDER.indexOf('tennis');

export async function mountOrbit(root: HTMLElement, opts: Options = {}): Promise<OrbitHandle | null> {
  const stage = root.querySelector<HTMLElement>('[data-orbit-stage]')!;
  const controls = root.querySelector<HTMLElement>('.orbit__controls');
  const canvas = root.querySelector<HTMLCanvasElement>('[data-orbit-canvas]')!;
  const film = root.querySelector<HTMLVideoElement>('[data-orbit-film]');
  const cats = [...root.querySelectorAll<HTMLElement>('[data-cat]')];
  const catLinks = cats.map((c) => c.querySelector<HTMLAnchorElement>('[data-cat-link]')!);
  const centreLabel = root.querySelector<HTMLElement>('[data-orbit-centre]');
  const centreHub = centreLabel?.closest<HTMLElement>('.orbit__hub');
  const skipBtn = root.querySelector<HTMLButtonElement>('[data-orbit-skip]');
  const replayBtn = root.querySelector<HTMLButtonElement>('[data-orbit-replay]');
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-orbit-sound]');
  const voice = root.querySelector<HTMLAudioElement>('[data-orbit-voice]');
  const subs = root.querySelector<HTMLElement>('[data-orbit-subs]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 46rem), (pointer: coarse)').matches;

  // Setup runs in short steps with a yield to the browser between each (each
  // leaves an orbit:<step> performance mark), so it never holds the page up.
  const step = (name: string): Promise<void> => {
    performance.mark(`orbit:${name}`);
    const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    return sched?.yield ? sched.yield() : new Promise((r) => setTimeout(r, 0));
  };

  const scene: OrbitScene | null = await createScene(canvas, {
    small, meshUrl: '/about/orbit/calibration.bin', preserve: !!opts.capture, step,
  });
  if (!scene) return null;

  // ---- state ------------------------------------------------------------------------
  const END = SCORE.end;
  let t = opts.settled ? END : 0;
  let prevT = t;
  let last = performance.now();
  let raf = 0, visible = true, held = !!opts.capture;
  let done = t >= END;
  let filmOn = false;          // the video is the clock
  let turn = 0;
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  const open = ORDER.map(() => 0);
  const spin = ORDER.map(() => 0);
  let openTarget = -1;         // the category that's open (one at a time)
  let attended = -1;           // the one the reader is pointing at or focused on
  let soundOn = false;

  // ---- layout ------------------------------------------------------------------------
  let W = 1, H = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    scene.resize(W, H, Math.min(devicePixelRatio || 1, small ? 1.75 : 2));
    root.classList.toggle('orbit--tall', scene.layout.tall);
  };

  // Labels sit under their pieces and follow the camera; an open category's
  // items fan out to the side away from the centre (or below, at the edges).
  const PLACE_WIDE = ['left', 'right', 'below', 'right', 'left', 'below'];
  const placeLabels = () => {
    cats.forEach((c, k) => {
      const s = scene.pieceScreen(k);
      c.style.setProperty('--x', `${s.x.toFixed(1)}px`);
      c.style.setProperty('--y', `${(s.y + s.r * 1.12).toFixed(1)}px`);
      c.style.setProperty('--r', `${s.r.toFixed(1)}px`);
      c.dataset.place = scene.layout.tall ? 'panel' : PLACE_WIDE[k];
      if (scene.layout.tall) {
        // On tall screens the open list sits in a band across the stage, just
        // above the controls (it grows upward from there, however many lines
        // it takes), rather than beside a piece where there's no room.
        const gutter = Math.min(32, W * 0.06);
        const above = (controls ? controls.getBoundingClientRect().top - stage.getBoundingClientRect().top : H * 0.88) - 14;
        c.style.setProperty('--px', `${(gutter - s.x).toFixed(1)}px`);
        c.style.setProperty('--pyb', `${(above - (s.y + s.r * 1.12)).toFixed(1)}px`);
        c.style.setProperty('--pw', `${(W - gutter * 2).toFixed(1)}px`);
      }
    });
    if (centreHub) {
      const c = scene.centreScreen();
      centreHub.style.setProperty('--x', `${c.x.toFixed(1)}px`);
      centreHub.style.setProperty('--y', `${c.y.toFixed(1)}px`);
    }
  };

  // ---- the clock and the frame ---------------------------------------------------------
  const setOpen = (k: number) => {
    if (k === openTarget) return;
    openTarget = k;
    cats.forEach((c, i) => c.classList.toggle('is-open', i === k));
    if (k >= 0 && done) sound.open();
  };

  const apply = (tt: number, dt: number) => {
    // Labels arrive as their piece finishes printing; the centre's as its
    // staircase completes; Tennis opens to show what every piece does.
    cats.forEach((c, k) => c.classList.toggle('is-on', tt >= printWindow(k)[1] - 0.15));
    centreLabel?.classList.toggle('is-on', tt >= SCORE.centreLabel);
    root.classList.toggle('orbit--revealed', tt >= SCORE.reveal);
    if (!done && openTarget === -1 && tt >= SCORE.open) setOpen(TENNIS);
    if (!done && tt < SCORE.open && openTarget !== -1) setOpen(-1);

    for (let k = 0; k < open.length; k++) {
      const goal = k === openTarget && tt >= SCORE.open ? 1 : 0;
      open[k] += (goal - open[k]) * Math.min(1, dt * 7);
      // A piece turns only while the reader is looking at it.
      if (k === attended && done) spin[k] += dt * 0.9;
      else spin[k] += (Math.round(spin[k] / (Math.PI * 2)) * Math.PI * 2 - spin[k]) * Math.min(1, dt * 3);
    }
    // The staircase turns with the score, then keeps turning once settled.
    turn = done ? turn + dt * 0.22 : tt * 0.22;
    scene.apply(tt, { lean, open, spin, turn });
  };

  const draw = () => {
    lean.x += (lean.tx - lean.x) * 0.08;
    lean.y += (lean.ty - lean.y) * 0.08;
    scene.render();
    placeLabels();
  };

  const settle = () => {
    if (done) return;
    done = true;
    root.classList.add('orbit--done');
    try { sessionStorage.setItem('about-intro-seen', '1'); } catch { /* blocked storage: it just plays again */ }
    const hadFocus = document.activeElement === skipBtn;
    if (skipBtn) skipBtn.hidden = true;
    if (replayBtn) replayBtn.hidden = false;
    if (openTarget === -1) setOpen(TENNIS);
    // The button the reader was on is gone: put them on the first category.
    if (hadFocus) requestAnimationFrame(() => catLinks[TENNIS]?.focus({ preventScroll: true }));
  };

  const stopFilm = () => {
    filmOn = false;
    if (film) { film.pause(); root.classList.add('orbit--film-gone'); }
  };


  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!held && !done) {
      if (filmOn && film && !film.paused && film.currentTime > 0) {
        t = Math.min(film.currentTime, SCORE.videoEnd);
        if (film.ended || t >= SCORE.videoEnd - 0.02) { stopFilm(); t = SCORE.videoEnd; }
      } else if (!filmOn) {
        t = Math.min(END, t + dt);
      }
      if (t >= END) settle();
    }
    sound.update(prevT, t);
    // The voice comes in on its cue, from the same clock as everything else.
    if (voice && soundOn && prevT < SCORE.voice && t >= SCORE.voice) { voice.currentTime = 0; voice.play().catch(() => {}); }
    prevT = t;
    apply(t, held ? 0 : dt);
    draw();
    // Settled, it keeps drawing for the staircase's slow turn (so the page never
    // looks frozen); that stops with reduced motion, off screen, or in a hidden tab.
    raf = visible && !document.hidden && !reduced.matches && !held ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => {
    if (raf || !visible || document.hidden || held) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  // ---- the film ---------------------------------------------------------------------------
  const startFilm = () => {
    if (!film || opts.settled || opts.capture) return false;
    // The shape of the stage picks the cut.
    const tall = W / H < 1;
    const base = `/about/orbit/opening-${tall ? '9x16' : '16x9'}`;
    film.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
    film.preload = 'auto';
    film.load();
    filmOn = true;
    root.classList.add('orbit--film');
    let started = false;
    film.addEventListener('playing', () => { started = true; root.classList.add('orbit--running'); wake(); }, { once: true });
    film.addEventListener('error', () => { if (!started) giveUpFilm(); }, { once: true });
    film.play().catch(() => giveUpFilm());
    // A slow connection shouldn't hold the page: if it hasn't started soon, go
    // straight to the live part.
    setTimeout(() => { if (!started) giveUpFilm(); }, 2600);
    return true;
  };
  const giveUpFilm = () => {
    if (!filmOn) return;
    stopFilm();
    t = Math.max(t, SCORE.scan[1]);
    root.classList.add('orbit--running');
    wake();
  };

  // ---- the reader is in charge -------------------------------------------------------------
  const skip = () => {
    if (voice && !voice.paused) voice.pause();
    if (done) return;
    if (filmOn) stopFilm();
    // Land just before the reveal, so the last moments still arrive rather than pop.
    t = Math.max(t, SCORE.reveal - 0.35);
    for (let k = 0; k < open.length; k++) open[k] = 0;
    root.classList.add('orbit--skipped');
    wake();
  };
  const replay = () => {
    t = 0; prevT = 0; done = false; turn = 0;
    setOpen(-1);
    root.classList.remove('orbit--done', 'orbit--revealed', 'orbit--skipped', 'orbit--film-gone');
    if (skipBtn) { skipBtn.hidden = false; skipBtn.focus({ preventScroll: true }); }
    if (replayBtn) replayBtn.hidden = true;
    if (film && film.querySelector('source')) {
      film.currentTime = 0;
      filmOn = true;
      root.classList.add('orbit--film');
      film.play().catch(() => giveUpFilm());
    } else if (!startFilm()) {
      t = SCORE.scan[1];
    }
    if (voice) { voice.pause(); voice.currentTime = 0; }
    wake();
  };
  skipBtn?.addEventListener('click', skip);
  replayBtn?.addEventListener('click', async () => {
    let muted = false;
    try { muted = localStorage.getItem('intro-sound') === 'off'; } catch { /* fine */ }
    if (!muted && !soundOn) { await sound.start().catch(() => {}); setSound(true); }
    replay();
  });

  // ---- sound --------------------------------------------------------------------------------
  const sound = createSound();
  const remember = (on: boolean) => { try { localStorage.setItem('intro-sound', on ? 'on' : 'off'); } catch { /* fine */ } };
  const mutedBefore = (() => { try { return localStorage.getItem('intro-sound') === 'off'; } catch { return false; } })();
  const setSound = (on: boolean) => {
    soundOn = on;
    sound.setEnabled(on);
    if (soundBtn) soundBtn.textContent = on ? 'Mute' : 'Play with sound';
    if (!on && voice && !voice.paused) voice.pause();
  };
  soundBtn?.addEventListener('click', async () => {
    if (soundOn) { remember(false); return setSound(false); }
    remember(true);
    // Audio first, then the picture: the hit must not play before anyone can hear it.
    await sound.start().catch(() => {});
    setSound(true);
    replay();
    soundBtn.focus({ preventScroll: true });
  });
  if (voice) {
    const track = voice.textTracks[0];
    if (track) {
      track.mode = 'hidden';
      track.addEventListener('cuechange', () => {
        const cue = track.activeCues?.[0] as VTTCue | undefined;
        if (subs) subs.textContent = cue?.text ?? '';
      });
    }
    const clear = () => { if (subs) subs.textContent = ''; };
    voice.addEventListener('pause', clear);
    voice.addEventListener('ended', clear);
  }

  // ---- input --------------------------------------------------------------------------------
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Keys on the intro's own buttons and links do what they say; any other
    // key (Escape included) skips.
    const own = !!(e.target as HTMLElement).closest?.('.orbit__controls, .orbit__map');
    if (own && ['Enter', ' ', 'Tab'].includes(e.key)) return;
    if (!done) skip();
  };
  const onWheel = () => skip();
  const startY = scrollY;
  const onScroll = () => { if (Math.abs(scrollY - startY) > 40) skip(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  reduced.addEventListener('change', () => { if (reduced.matches) { setSound(false); stopFilm(); t = END; settle(); apply(t, 0); draw(); } });

  const pieceAt = (x: number, y: number) => {
    let best = -1, bestD = Infinity;
    for (let k = 0; k < cats.length; k++) {
      const s = scene.pieceScreen(k), d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r * 1.3 && d < bestD) { best = k; bestD = d; }
    }
    return best;
  };
  const attend = (k: number) => {
    if (k === attended) return;
    attended = k;
    if (k >= 0 && done) { sound.hover(); setOpen(k); }
    stage.style.cursor = k >= 0 && done ? 'pointer' : '';
    wake();
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!done && !(e.target as HTMLElement).closest('button, a')) skip();
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    lean.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    lean.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    if (done && e.pointerType === 'mouse') attend(pieceAt(e.clientX - r.left, e.clientY - r.top));
    wake();
  });
  stage.addEventListener('pointerleave', () => { lean.tx = 0; lean.ty = 0; attend(-1); wake(); });
  // A click on a piece is a click on its category: on a mouse that follows the
  // link; on touch, the first tap opens it and a second follows.
  let lastPointer = 'mouse';
  stage.addEventListener('pointerup', (e) => { lastPointer = e.pointerType; }, true);
  stage.addEventListener('click', (e) => {
    if (!done || (e.target as HTMLElement).closest('a, button')) return;
    const r = stage.getBoundingClientRect();
    const k = pieceAt(e.clientX - r.left, e.clientY - r.top);
    if (k < 0) return;
    if (lastPointer !== 'mouse' && openTarget !== k) { setOpen(k); wake(); return; }
    catLinks[k].click();
  });
  cats.forEach((c, k) => {
    const link = catLinks[k];
    c.addEventListener('focusin', () => { attend(k); setOpen(k); });
    c.addEventListener('focusout', (e) => { if (!c.contains(e.relatedTarget as Node)) attend(-1); });
    link.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') attend(k); });
    link.addEventListener('pointerleave', () => attend(-1));
    link.addEventListener('click', (e) => {
      // Touch: open first, follow on the second tap.
      if (lastPointer !== 'mouse' && openTarget !== k) { e.preventDefault(); setOpen(k); wake(); }
    });
    link.addEventListener('pointerup', (e) => { lastPointer = e.pointerType; });
  });

  // ---- lifecycle ------------------------------------------------------------------------------
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) sound.hush(); wake(); });
  io.observe(stage);
  const onVisibility = () => { if (document.hidden) sound.suspend(); else sound.resume(); wake(); };
  document.addEventListener('visibilitychange', onVisibility);
  // (An isolated still is drawn once and must not be redrawn as the full scene.)
  let isolated = false;
  const ro = new ResizeObserver(() => { if (isolated) return; resize(); apply(t, 0); draw(); });
  ro.observe(stage);

  resize();
  apply(t, 0);
  // Compile every shader off the main thread where the browser can
  // (KHR_parallel_shader_compile), instead of in one long block on first draw.
  await scene.compile().catch(() => {});
  await step('compiled');

  if (!opts.capture && !opts.settled && !mutedBefore && !reduced.matches) {
    sound.autoplay(() => { if (!done) setSound(true); });
  }

  if (opts.capture) {
    const iso = typeof opts.capture === 'object' ? opts.capture.isolate : undefined;
    if (iso) { isolated = true; scene.isolate(iso); }
    root.dataset.captured = 'true';
  } else if (done) {
    settle();
    root.classList.add('orbit--running');
    setOpen(TENNIS);
    draw();
    wake();
  } else if (!startFilm()) {
    t = SCORE.scan[1];
    root.classList.add('orbit--running');
    wake();
  }

  return {
    skip,
    replay,
    async seek(tt, dt) {
      held = true;
      t = Math.max(0, Math.min(END, tt));
      if (dt === undefined) setOpen(-1);
      if (t >= END) { done = false; settle(); }
      else { done = false; root.classList.remove('orbit--done'); }
      // Review captures can show the film under the live scene, as a visitor sees it.
      const withFilm = typeof opts.capture === 'object' && opts.capture.film;
      if (film && withFilm && !film.querySelector('source')) {
        const base = `/about/orbit/opening-${W / H < 1 ? '9x16' : '16x9'}`;
        film.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
        film.preload = 'auto';
        film.load();
        await new Promise((r) => film.addEventListener('loadeddata', r, { once: true }));
        root.classList.add('orbit--film');
      }
      if (film && film.querySelector('source') && t < SCORE.videoEnd) {
        film.currentTime = Math.min(t, film.duration - 0.001);
        await new Promise((r) => film.addEventListener('seeked', r, { once: true }));
      }
      root.classList.toggle('orbit--film-gone', t >= SCORE.videoEnd);
      if (dt !== undefined) { apply(t, dt); draw(); return; }
      // Settle the open/turn springs as if time had run up to here.
      apply(t, 0);
      for (let i = 0; i < 30; i++) apply(t, 1 / 30);
      draw();
    },
    async soundtrack(duration) {
      const b = await sound.offline(duration);
      return { sampleRate: b.sampleRate, channels: [b.getChannelData(0), b.getChannelData(1)] };
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      sound.dispose(); scene.dispose();
    },
  };
}
