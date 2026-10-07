/**
 * The About page intro, "Ignition": a real-looking tennis ball catches fire; its
 * embers cool into scan points that become a chess knight, the foot scanner's
 * calibration object (printed in layers, then scanned), a neural network and
 * the gyroid, then explode into five pieces, each a link.
 *
 * This module is the conductor: one clock, a few uniforms per frame. The look
 * lives in ball.ts, fire.ts and cloud.ts; the shapes in shapes.ts.
 *
 * Rules it keeps (CONTRIBUTING.md, "Motion and 3D"):
 *  - plays once per visit; Skip is first in the tab order; any key, wheel, touch
 *    or click on the stage skips to the end, so the reader is never held
 *  - once the pieces have settled nothing moves on its own: the scene leans
 *    toward the pointer, and a piece turns only while it is hovered or focused
 *  - the links are real <a> elements; the canvas is decoration
 *  - stops rendering when off screen or in a hidden tab
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBall } from './ball';
import { createFire } from './fire';
import { createCloud, PIECES, PRINT_LAYERS, type Timing } from './cloud';
import { createSound } from './sound';
import * as shapes from './shapes';

// ---- the score ---------------------------------------------------------------
// Score seconds. Each shape gets a moment fully formed (and still turning, so
// nothing ever freezes) before the next transition starts. The whole score
// plays at PACE: change that one number to make the intro faster or slower
// without retiming anything (sound included). At 1.25 it runs about 10 s.
const PACE = 1.25;
const TIMING: Timing = {
  ignite: 1.3, burnDur: 1.5, spin: 0.45,
  ember: 0.4, fly1: 1.0,
  start: [5.1, 7.2, 8.9, 11.1],
  spread: [0.95, 0.35, 0.35, 0.22],
  dur: [0.6, 0.85, 0.95, 1.5],
};
const SCAN = [6.75, 7.2];      // scan line sweeps the printed object
const WAVE = [8.0, 8.9];       // a signal runs through the network
const EQ = [9.1, 10.3];        // the equation types out
const END = 12.8;              // pieces settled
const REVEAL = 12.05;          // labels and title arrive as the pieces land, not over the dust

const CAPTIONS: [number, string][] = [
  [0.25, '01 · Tennis'],
  [3.25, '02 · Chess'],
  [5.2, '03 · 3D printed'],
  [6.75, '03 · 3D printed · scanned'],
  [7.3, '04 · Machine learning'],
  [8.95, '05 · Mathematics'],
  [11.05, ''],
];
const EQUATION = 'sin x cos z + sin y cos x + sin z cos y = 0';

/** Best viewing angle for each shape, eased between, plus a slow drift so a held shape still turns. */
const ANGLES: [number, number][] = [[3.6, -0.5], [5.1, -0.3], [7.0, 0.55], [8.6, 0.12], [10.4, 0.5]];
function turnAt(t: number) {
  let a = ANGLES[0][1];
  for (let i = 1; i < ANGLES.length; i++) {
    const [t0, a0] = ANGLES[i - 1], [t1, a1] = ANGLES[i];
    if (t >= t1) a = a1;
    else if (t > t0) { const k = (t - t0) / (t1 - t0); a = a0 + (a1 - a0) * k * k * (3 - 2 * k); break; }
  }
  return a + (t - 6) * 0.11;
}

// Where the five pieces sit, in screen space (-1…1), for wide and tall stages.
const SLOTS_WIDE: [number, number][] = [[-0.64, 0.36], [-0.32, 0.1], [0, 0.42], [0.32, 0.1], [0.64, 0.36]];
const SLOTS_TALL: [number, number][] = [[-0.42, 0.66], [0.42, 0.47], [-0.42, 0.28], [0.42, 0.09], [-0.42, -0.1]];

export interface IntroHandle {
  skip(): void;
  replay(): void;
  /** Hold the intro at a moment (seconds); for the stills script and tests. */
  seek(t: number): void;
  dispose(): void;
}

interface Options {
  /** Start already settled (a return visit within the session). */
  settled?: boolean;
  /** Offline capture for the stills: render one frame and stop. */
  capture?: { mode: 'poster' } | { mode: 'piece'; piece: number };
}

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export async function mountIntro(root: HTMLElement, opts: Options = {}): Promise<IntroHandle | null> {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-intro-canvas]')!;
  const stage = root.querySelector<HTMLElement>('[data-intro-stage]')!;
  const caption = root.querySelector<HTMLElement>('[data-intro-caption]');
  const eq = root.querySelector<HTMLElement>('[data-intro-eq]');
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-piece]')];
  const skipBtn = root.querySelector<HTMLButtonElement>('[data-intro-skip]');
  const replayBtn = root.querySelector<HTMLButtonElement>('[data-intro-replay]');
  const audio = root.querySelector<HTMLAudioElement>('[data-intro-audio]');
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-intro-sound]');
  const subs = root.querySelector<HTMLElement>('[data-intro-subs]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 46rem), (pointer: coarse)').matches;

  // Setup runs in short steps with a yield to the browser between each, so
  // building the scene never holds the page up for long; the poster is on
  // screen meanwhile. Each step leaves a performance mark (intro:<step>) for
  // profiling.
  const step = (name: string): Promise<void> => {
    performance.mark(`intro:${name}`);
    const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    return sched?.yield ? sched.yield() : new Promise((r) => setTimeout(r, 0));
  };
  const N = small ? 9000 : 20000;
  const calibrationPoints = shapes.calibration(N, '/about/calibration-points.bin');

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.capture, // the stills script reads the pixels back
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  // Neutral keeps the felt's optic yellow saturated; ACES washes it to lemon.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  await step('environment');

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  // Light: a warm key from above left, a cold rim from behind (the site's ice),
  // and the fire's own heat, which grows as the ball burns.
  const key = new THREE.DirectionalLight('#fff1dc', 3.2);
  key.position.set(-2.2, 3.2, 2.6);
  const rim = new THREE.DirectionalLight(css('--ice', '#4DF3FF'), 1.6);
  rim.position.set(2.6, 1.2, -2.8);
  const heat = new THREE.PointLight('#ff7a2a', 0, 4, 1.6);
  heat.position.set(0.2, -0.4, 0.9);
  scene.add(key, rim, heat);

  // ---- cast ------------------------------------------------------------------
  const ball = createBall();
  await step('ball');
  const ballCloud = shapes.ball(N);
  const knightCloud = shapes.knight(N);
  await step('knight');
  const net = shapes.network(N);
  await step('network');
  const gyroidCloud = shapes.gyroid(N);
  await step('gyroid');
  const cloudShapes = {
    ball: ballCloud,
    knight: knightCloud,
    calibration: await calibrationPoints,
    network: net.cloud,
    networkNodes: net.nodes,
    networkEdges: shapes.networkEdges(),
    gyroid: gyroidCloud,
  };
  const fire = createFire(small ? 1400 : 3200, { ignite: TIMING.ignite, burnDur: TIMING.burnDur, spin: TIMING.spin });
  const cloud = createCloud(N, cloudShapes, TIMING);
  scene.add(ball.group, fire.points, cloud.points, cloud.lines);

  // Where the network's signal crosses each layer, as a fraction of the wave.
  const layerX: number[] = [];
  for (let l = 0, i = 0; l < shapes.LAYERS.length; i += shapes.LAYERS[l], l++) layerX.push((net.nodes[i].x + 1.15) / 2.3);
  const sound = createSound({
    pace: PACE,
    ignite: TIMING.ignite,
    burnDur: TIMING.burnDur,
    shimmer: TIMING.ignite + TIMING.burnDur * 0.55,
    knight: TIMING.ignite + TIMING.burnDur + TIMING.ember * 0.55 + 0.25 + TIMING.fly1,
    print: { start: TIMING.start[0], spread: TIMING.spread[0], dur: TIMING.dur[0], layers: PRINT_LAYERS },
    scan: [SCAN[0], SCAN[1]],
    network: TIMING.start[1],
    wave: [WAVE[0], WAVE[1]],
    layerX,
    gyroid: TIMING.start[2],
    eq: [EQ[0], EQ[1]],
    eqChars: EQUATION.length,
    explode: TIMING.start[3] + 0.04,
    land: TIMING.start[3] + TIMING.dur[3] * 0.8,
    end: END,
    activity: fire.activity,
  });
  await step('cloud');

  // ---- framing -----------------------------------------------------------------
  let W = 1, H = 1, dist = 5, pxPerWorld = 100, radiusPx = 80;
  const slotsWorld = Array.from({ length: PIECES }, () => new THREE.Vector3());
  const tall = () => W / H < 1.15;

  const layout = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Fit a unit sphere (plus room for the swirl) inside the narrower of the
    // two fields of view, so tall phones see the whole shape too.
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    dist = 1.32 / Math.sin(Math.min(vHalf, hHalf));
    camera.updateProjectionMatrix();

    const halfH = dist * Math.tan(vHalf), halfW = halfH * camera.aspect;
    pxPerWorld = H / (2 * halfH);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pxPerUnit = buf.y / (2 * Math.tan(vHalf));
    fire.uniforms.uPxPerUnit.value = pxPerUnit;
    cloud.uniforms.uPxPerUnit.value = pxPerUnit;
    cloud.uniforms.uFocus.value = dist;

    const slots = opts.capture?.mode === 'piece' ? null : tall() ? SLOTS_TALL : SLOTS_WIDE;
    radiusPx = tall() ? Math.min(W * 0.14, H * 0.068) : Math.min(W * 0.066, H * 0.12);
    if (slots) {
      slots.forEach(([x, y], k) => slotsWorld[k].set(x * halfW, y * halfH, 0));
      cloud.layout(slotsWorld, radiusPx / pxPerWorld);
    } else if (opts.capture?.mode === 'piece') {
      // One piece, centred and large, drawn with every point (so it is as dense
      // as the small pieces on stage), the rest parked out of shot.
      const piece = (opts.capture as { piece: number }).piece;
      slotsWorld.forEach((v, k) => v.set(k === piece ? 0 : 99, 0, 0));
      cloud.layout(slotsWorld, 1.0, piece);
      cloud.uniforms.uSize.value = 0.016;
    }
    camera.position.set(pointer.x * 0.35, 0.08 + pointer.y * 0.22, dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    placeLabels();
  };

  // Labels sit under their pieces; positions follow the camera's lean.
  const tmp = new THREE.Vector3();
  const screenOf = (v: THREE.Vector3) => {
    tmp.copy(v).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
  };
  const placeLabels = () => {
    links.forEach((a, k) => {
      const s = screenOf(slotsWorld[k]);
      a.style.setProperty('--x', `${s.x.toFixed(1)}px`);
      a.style.setProperty('--y', `${(s.y + radiusPx * 1.08).toFixed(1)}px`);
    });
  };

  // ---- clock -------------------------------------------------------------------
  let t = opts.settled ? END : 0;
  let last = performance.now();
  let raf = 0, visible = true, done = t >= END, held = false;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let hover = -1, hoverSpin = 0;
  let soundOn = false;
  const voicePlaying = () => !!audio && !audio.paused;

  const setCaption = (tt: number) => {
    if (!caption) return;
    let text = '';
    for (const [at, s] of CAPTIONS) if (tt >= at) text = s;
    if (caption.textContent !== text) {
      caption.classList.remove('is-on');
      caption.textContent = text;
      if (text) requestAnimationFrame(() => caption.classList.add('is-on'));
    }
    if (eq) {
      const k = Math.max(0, Math.min(1, (tt - EQ[0]) / (EQ[1] - EQ[0])));
      const shown = tt > TIMING.start[3] + 0.4 ? '' : EQUATION.slice(0, Math.round(k * EQUATION.length));
      if (eq.textContent !== shown) eq.textContent = shown;
    }
  };

  const apply = (tt: number) => {
    // Ball: turning, then burning; gone once the front has crossed it.
    ball.group.rotation.y = TIMING.spin * tt;
    ball.setBurn(((tt - TIMING.ignite) / TIMING.burnDur) * 1.04 - 0.02);
    ball.group.visible = tt < TIMING.ignite + TIMING.burnDur + 0.2;
    fire.uniforms.uT.value = tt;
    fire.points.visible = tt > TIMING.ignite - 0.1 && tt < TIMING.ignite + TIMING.burnDur + 1.4;
    heat.intensity = fire.activity(tt) * (5 + Math.sin(tt * 31) * 0.8 + Math.sin(tt * 17) * 0.6);

    const u = cloud.uniforms;
    u.uT.value = tt;
    u.uTurn.value = turnAt(tt);
    const scan = (tt - SCAN[0]) / (SCAN[1] - SCAN[0]);
    u.uScanOn.value = scan > 0 && scan < 1 ? 1 : 0;
    u.uScanY.value = -1 + scan * 2;
    const wave = (tt - WAVE[0]) / (WAVE[1] - WAVE[0]);
    u.uWaveOn.value = wave > 0 && wave < 1.15 ? 1 : 0;
    u.uWaveX.value = -1.15 + wave * 2.3;
    const net0 = TIMING.start[1] + TIMING.spread[1] + TIMING.dur[1] * 0.6;
    u.uLineOpacity.value = Math.max(0, Math.min(1, (tt - net0) / 0.35)) * (1 - Math.max(0, Math.min(1, (tt - TIMING.start[2]) / 0.3)));
    u.uHover.value = done ? hover : -1;
    u.uHoverSpin.value = hoverSpin;
    setCaption(tt);
    root.classList.toggle('intro--revealed', tt >= REVEAL);
  };

  const draw = () => {
    // Lean toward the pointer: the one thing that responds after the pieces settle.
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    camera.position.set(pointer.x * 0.35, 0.08 + pointer.y * 0.22, dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    if (done) placeLabels();
    renderer.render(scene, camera);
  };

  const settle = () => {
    done = true;
    root.classList.add('intro--done');
    try { sessionStorage.setItem('about-intro-seen', '1'); } catch { /* blocked storage: it just plays again */ }
    const hadFocus = document.activeElement === skipBtn;
    if (skipBtn) skipBtn.hidden = true;
    if (replayBtn) replayBtn.hidden = false;
    // The button the reader was on is gone: put them on the first piece (once
    // the links are visible, which is the same moment).
    if (hadFocus) requestAnimationFrame(() => links[0]?.focus({ preventScroll: true }));
  };

  const moving = () => (!done && !held) || Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.002 || hover >= 0;

  let prevT = t;
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!done && !held) {
      // With the voiceover playing, the audio is the clock, so picture and
      // voice can't drift apart.
      t = voicePlaying() ? Math.min(END, audio!.currentTime * PACE) : Math.min(END, t + dt * PACE);
      if (t >= END) settle();
    }
    sound.update(prevT, t);
    prevT = t;
    if (hover >= 0) hoverSpin += dt * 1.6;
    apply(t);
    draw();
    raf = visible && !document.hidden && moving() ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => {
    if (raf || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  // ---- the reader is in charge -----------------------------------------------
  const skip = () => {
    if (voicePlaying()) audio!.pause(); // the voice would be out of step with the picture
    if (done) return;
    // Land mid-settle, so the pieces still arrive (half a second) rather than pop.
    t = Math.max(t, TIMING.start[3] + TIMING.dur[3] * 0.55);
    root.classList.add('intro--skipped');
    wake();
  };
  const replay = () => {
    t = 0; prevT = 0; done = false; hover = -1;
    root.classList.remove('intro--done', 'intro--revealed', 'intro--skipped');
    if (skipBtn) { skipBtn.hidden = false; skipBtn.focus({ preventScroll: true }); }
    if (replayBtn) replayBtn.hidden = true;
    wake();
  };
  skipBtn?.addEventListener('click', skip);
  replayBtn?.addEventListener('click', () => { audio?.pause(); replay(); });

  // Sound plays by itself, quietly, whenever the browser allows it, unless
  // this reader muted it before (remembered). "Mute" stops it; "Play with
  // sound" replays the intro with the effects (and the voiceover, once one
  // exists). Captions for the voice come from the same VTT as the transcript.
  const remember = (on: boolean) => { try { localStorage.setItem('intro-sound', on ? 'on' : 'off'); } catch { /* fine */ } };
  const mutedBefore = (() => { try { return localStorage.getItem('intro-sound') === 'off'; } catch { return false; } })();
  const setSound = (on: boolean) => {
    soundOn = on;
    sound.setEnabled(on);
    if (soundBtn) soundBtn.textContent = on ? 'Mute' : 'Play with sound';
    if (!on && voicePlaying()) audio!.pause();
  };
  soundBtn?.addEventListener('click', async () => {
    if (soundOn) { remember(false); return setSound(false); }
    remember(true);
    // Audio first, then the picture: starting the audio engine can take a
    // moment, and the ignition must not play before anyone can hear it.
    await sound.start().catch(() => {});
    setSound(true);
    replay();
    soundBtn.focus({ preventScroll: true });
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  });
  if (audio) {
    const track = audio.textTracks[0];
    if (track) {
      track.mode = 'hidden';
      track.addEventListener('cuechange', () => {
        const cue = track.activeCues?.[0] as VTTCue | undefined;
        if (subs) subs.textContent = cue?.text ?? '';
      });
    }
    const clear = () => { if (subs) subs.textContent = ''; };
    audio.addEventListener('pause', clear);
    audio.addEventListener('ended', clear);
    audio.addEventListener('play', wake);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Enter, Space and Tab on the intro's own buttons do what the button says;
    // any other key (Escape included) skips, and stops the voiceover.
    const onControl = !!(e.target as HTMLElement).closest?.('.intro__controls');
    if (onControl && ['Enter', ' ', 'Tab'].includes(e.key)) return;
    if (!done || voicePlaying()) skip();
  };
  const onWheel = () => skip();
  const onStagePointer = (e: PointerEvent) => {
    if (!done && !(e.target as HTMLElement).closest('button, a')) skip();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  stage.addEventListener('pointerdown', onStagePointer);
  const startY = scrollY;
  const onScroll = () => { if (Math.abs(scrollY - startY) > 40) skip(); };
  window.addEventListener('scroll', onScroll, { passive: true });
  reduced.addEventListener('change', () => { if (reduced.matches) { setSound(false); t = END; settle(); apply(t); draw(); } });

  // Pointer: lean, hover, click-through to the piece's link.
  const pieceAt = (x: number, y: number) => {
    let best = -1, bestD = Infinity;
    slotsWorld.forEach((v, k) => {
      const s = screenOf(v), d = Math.hypot(s.x - x, s.y - y);
      if (d < radiusPx * 1.25 && d < bestD) { best = k; bestD = d; }
    });
    return best;
  };
  const setHover = (k: number) => {
    if (k === hover) return;
    hover = k;
    if (k >= 0 && done) sound.hover();
    links.forEach((a, i) => a.classList.toggle('is-hot', i === k));
    stage.style.cursor = k >= 0 ? 'pointer' : '';
    wake();
  };
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    if (done && e.pointerType === 'mouse') setHover(pieceAt(e.clientX - r.left, e.clientY - r.top));
    wake();
  });
  stage.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; if (done) setHover(-1); wake(); });
  stage.addEventListener('click', (e) => {
    if (!done || (e.target as HTMLElement).closest('a, button')) return;
    const r = stage.getBoundingClientRect();
    const k = pieceAt(e.clientX - r.left, e.clientY - r.top);
    if (k >= 0) links[k].click();
  });
  links.forEach((a, k) => {
    a.addEventListener('focus', () => setHover(k));
    a.addEventListener('blur', () => setHover(-1));
    a.addEventListener('pointerenter', () => setHover(k));
    a.addEventListener('pointerleave', () => setHover(-1));
  });

  // ---- lifecycle ---------------------------------------------------------------
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) sound.hush(); wake(); });
  io.observe(stage);
  const onVisibility = () => { if (document.hidden) sound.suspend(); else sound.resume(); wake(); };
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => { layout(); apply(t); draw(); });
  ro.observe(stage);

  layout();
  apply(t);
  // Compile every shader off the main thread where the browser can
  // (KHR_parallel_shader_compile), instead of in one long block on first draw.
  await renderer.compileAsync(scene, camera);
  await step('compiled');

  if (!opts.capture && !opts.settled && !mutedBefore && !reduced.matches) {
    sound.autoplay(() => { if (!done) setSound(true); });
  }

  if (opts.capture) {
    // One frame for the stills script.
    t = opts.capture.mode === 'poster' ? 0 : END;
    done = opts.capture.mode !== 'poster';
    apply(t);
    camera.position.set(0, 0.08, dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    root.dataset.captured = 'true';
  } else {
    if (done) settle();
    root.classList.add('intro--running');
    wake();
  }

  return {
    skip,
    replay,
    seek(tt) {
      held = true;
      t = Math.max(0, Math.min(END, tt));
      if (t >= END) settle();
      else { done = false; root.classList.remove('intro--done'); }
      apply(t);
      draw();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      ball.dispose(); fire.dispose(); cloud.dispose(); sound.dispose();
      env.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
