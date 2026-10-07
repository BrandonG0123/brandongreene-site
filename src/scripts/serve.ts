/**
 * The serve: a pose-tracked skeleton, scrubbed by scroll.
 *
 * Data comes from public/serve/pose.json — joint positions per frame, produced
 * offline by pose estimation on Brandon's own footage (see scripts/pose/). Until
 * that exists, development builds use a hand-keyframed SYNTHETIC serve so the
 * design can be judged; production builds never show it. The page says which
 * one you are looking at.
 *
 * Coordinates are metres, x toward the net, y up, ground at y = 0.
 */

export type Joint =
  | 'head' | 'neck'
  | 'shL' | 'shR' | 'elL' | 'elR' | 'wrL' | 'wrR'
  | 'hipL' | 'hipR' | 'knL' | 'knR' | 'anL' | 'anR'
  | 'racket';

export type Vec = [number, number];
export interface PoseFrame { joints: Record<Joint, Vec>; ball: Vec | null }
export interface PoseData { source: 'real' | 'synthetic'; frames: PoseFrame[] }

/* ------------------------------------------------------------------------ */
/* Synthetic serve — development only                                        */
/* ------------------------------------------------------------------------ */

type Key = { t: number; j: Record<Joint, Vec> };

const KEYS: Key[] = [
  { t: 0.0, j: { // ready
    head: [0.0, 1.7], neck: [0.0, 1.52], shL: [0.06, 1.45], shR: [-0.06, 1.45],
    elL: [0.18, 1.2], wrL: [0.28, 1.05], elR: [-0.1, 1.18], wrR: [-0.05, 0.95],
    hipL: [0.04, 0.98], hipR: [-0.04, 0.98], knL: [0.12, 0.52], knR: [-0.12, 0.52],
    anL: [0.18, 0.05], anR: [-0.22, 0.05], racket: [0.25, 0.72] } },
  { t: 0.22, j: { // toss release
    head: [-0.02, 1.69], neck: [-0.02, 1.51], shL: [0.04, 1.47], shR: [-0.08, 1.43],
    elL: [0.1, 1.8], wrL: [0.14, 2.1], elR: [-0.3, 1.2], wrR: [-0.45, 1.1],
    hipL: [0.0, 0.96], hipR: [-0.06, 0.96], knL: [0.14, 0.54], knR: [-0.12, 0.54],
    anL: [0.18, 0.05], anR: [-0.22, 0.05], racket: [-0.8, 0.98] } },
  { t: 0.42, j: { // trophy
    head: [-0.04, 1.58], neck: [-0.04, 1.4], shL: [0.04, 1.36], shR: [-0.1, 1.33],
    elL: [0.1, 1.7], wrL: [0.14, 1.98], elR: [-0.32, 1.38], wrR: [-0.32, 1.7],
    hipL: [-0.02, 0.84], hipR: [-0.1, 0.84], knL: [0.2, 0.48], knR: [-0.02, 0.46],
    anL: [0.18, 0.05], anR: [-0.2, 0.05], racket: [-0.38, 2.24] } },
  { t: 0.56, j: { // racket drop
    head: [0.0, 1.71], neck: [0.0, 1.53], shL: [0.06, 1.48], shR: [-0.06, 1.46],
    elL: [0.14, 1.45], wrL: [0.1, 1.25], elR: [-0.22, 1.74], wrR: [-0.12, 1.56],
    hipL: [0.02, 1.0], hipR: [-0.06, 1.0], knL: [0.16, 0.58], knR: [0.0, 0.56],
    anL: [0.2, 0.08], anR: [-0.12, 0.1], racket: [-0.32, 1.02] } },
  { t: 0.68, j: { // contact
    head: [0.06, 1.92], neck: [0.05, 1.74], shL: [0.1, 1.67], shR: [0.0, 1.71],
    elL: [0.18, 1.41], wrL: [0.1, 1.19], elR: [0.07, 2.06], wrR: [0.12, 2.37],
    hipL: [0.06, 1.17], hipR: [0.0, 1.17], knL: [0.1, 0.73], knR: [-0.04, 0.73],
    anL: [0.1, 0.31], anR: [-0.1, 0.33], racket: [0.28, 2.95] } },
  { t: 0.84, j: { // follow-through
    head: [0.3, 1.62], neck: [0.28, 1.45], shL: [0.34, 1.4], shR: [0.22, 1.42],
    elL: [0.2, 1.2], wrL: [0.12, 1.05], elR: [0.48, 1.2], wrR: [0.4, 0.92],
    hipL: [0.3, 0.95], hipR: [0.2, 0.95], knL: [0.42, 0.52], knR: [0.1, 0.62],
    anL: [0.5, 0.05], anR: [-0.05, 0.35], racket: [0.04, 0.6] } },
  { t: 1.0, j: { // recover
    head: [0.4, 1.68], neck: [0.4, 1.5], shL: [0.46, 1.45], shR: [0.34, 1.45],
    elL: [0.5, 1.18], wrL: [0.48, 0.98], elR: [0.3, 1.18], wrR: [0.36, 0.98],
    hipL: [0.44, 0.97], hipR: [0.36, 0.97], knL: [0.5, 0.52], knR: [0.32, 0.52],
    anL: [0.56, 0.05], anR: [0.26, 0.05], racket: [0.72, 0.9] } },
];

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function syntheticBall(t: number): Vec | null {
  if (t < 0.16) return null;                          // still in the hand
  if (t <= 0.68) {
    // a real toss is a parabola: apex just before contact
    const k = (t - 0.6) / 0.44;
    return [lerp(0.28, 0.3, (t - 0.16) / 0.52), 1.1 + 1.9 * (1 - k * k)];
  }
  const f = (t - 0.68) / 0.12;                         // struck: gone in ~0.12 of the scroll
  if (f > 1) return null;
  return [0.3 + f * f * 4.2 + f * 1.4, 2.94 - f * 0.9];
}

export function synthesise(n = 240): PoseData {
  const frames: PoseFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0;
    while (k < KEYS.length - 2 && t > KEYS[k + 1].t) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    const u = ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    const joints = {} as Record<Joint, Vec>;
    for (const name of Object.keys(a.j) as Joint[]) {
      joints[name] = [lerp(a.j[name][0], b.j[name][0], u), lerp(a.j[name][1], b.j[name][1], u)];
    }
    let ball = syntheticBall(t);
    if (!ball && t < 0.16) ball = [joints.wrL[0] + 0.03, joints.wrL[1] + 0.02];
    frames.push({ joints, ball });
  }
  return { source: 'synthetic', frames };
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                 */
/* ------------------------------------------------------------------------ */

const BONES: [Joint, Joint, 'near' | 'far' | 'core'][] = [
  ['head', 'neck', 'core'], ['shL', 'shR', 'core'],
  ['shL', 'elL', 'near'], ['elL', 'wrL', 'near'],
  ['shR', 'elR', 'far'], ['elR', 'wrR', 'far'],
  ['hipL', 'hipR', 'core'],
  ['hipL', 'knL', 'near'], ['knL', 'anL', 'near'],
  ['hipR', 'knR', 'far'], ['knR', 'anR', 'far'],
];

const PHASES: [number, string][] = [
  [0.0, 'Ready'], [0.16, 'Toss'], [0.36, 'Trophy'], [0.52, 'Racket drop'],
  [0.64, 'Contact'], [0.78, 'Follow-through'],
];

/** Interior angle at b, in degrees — the same maths footscan uses for joint angles. */
function angle(a: Vec, b: Vec, c: Vec) {
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const d = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

export interface ServeRenderer {
  render(progress: number): void;
  resize(): void;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  data: PoseData | null,
  opts: { figure: boolean } = { figure: true },
): ServeRenderer {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  let colours = readColours();

  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return {
      ice: v('--ice', '#4DF3FF'), violet: v('--violet', '#8B5CFF'), ball: v('--ball', '#D4FF3A'),
      fg: v('--fg', '#EEF2F7'), muted: v('--fg-muted', '#8A94A6'), rule: v('--rule', '#5B677B'),
      light: document.documentElement.dataset.theme === 'light',
    };
  }
  window.addEventListener('themechange', () => { colours = readColours(); });

  // World → screen. Frame the action: x from -1.2 to 2.6 m, y from -0.1 to 3.25 m.
  // BASE is the region that must always be visible: feet to the top of the
  // toss. The live view is re-derived from it on every resize — never from the
  // previous view, which would let one bad measurement poison every later one.
  const BASE = { x0: -1.0, x1: 1.9, y0: -0.12, y1: 3.15 } as const;
  const view = { ...BASE };
  const sx = (x: number) => ((x - view.x0) / (view.x1 - view.x0)) * W;
  const sy = (y: number) => H - ((y - view.y0) / (view.y1 - view.y0)) * H;
  const P = (v: Vec) => [sx(v[0]), sy(v[1])] as const;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    // Hidden or not yet laid out: nothing sensible to measure. Bail rather than
    // compute an aspect ratio of 0/0.
    if (r.width < 2 || r.height < 2) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep metres square: start from BASE and widen whichever axis has slack.
    Object.assign(view, BASE);
    const aspect = W / H, worldAspect = (BASE.x1 - BASE.x0) / (BASE.y1 - BASE.y0);
    if (aspect > worldAspect) {
      const span = (BASE.y1 - BASE.y0) * aspect, mid = (BASE.x0 + BASE.x1) / 2;
      view.x0 = mid - span / 2; view.x1 = mid + span / 2;
    } else {
      const span = (BASE.x1 - BASE.x0) / aspect, mid = (BASE.y0 + BASE.y1) / 2;
      view.y0 = mid - span / 2; view.y1 = mid + span / 2;
    }
  };

  const frameAt = (p: number) => {
    if (!data) return null;
    const f = Math.round(p * (data.frames.length - 1));
    return data.frames[Math.max(0, Math.min(data.frames.length - 1, f))];
  };

  const neon = (from: readonly [number, number], to: readonly [number, number], col: string, width: number, alpha: number) => {
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha * (colours.light ? 0.25 : 0.14);
    ctx.lineWidth = width * 5;
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
  };

  const dot = (at: readonly [number, number], r: number, col: string, glow: number) => {
    const g = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], r * glow);
    g.addColorStop(0, col);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = colours.light ? 0.35 : 0.55;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(at[0], at[1], r * glow, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(at[0], at[1], r, 0, Math.PI * 2); ctx.fill();
  };

  const label = (text: string, at: readonly [number, number], dx: number, dy: number, col = colours.muted) => {
    ctx.globalAlpha = 1;
    ctx.font = `500 ${Math.max(10, Math.round(H * 0.016))}px "IBM Plex Mono", ui-monospace, monospace`;
    // Flip to the other side rather than run off the canvas on narrow screens.
    const w = ctx.measureText(text).width;
    if (dx < 0 && at[0] + dx - w < 4) dx = -dx;
    else if (dx > 0 && at[0] + dx + w > W - 4) dx = -dx;
    ctx.fillStyle = col;
    ctx.textAlign = dx < 0 ? 'right' : 'left';
    ctx.fillText(text, at[0] + dx, at[1] + dy);
    ctx.strokeStyle = colours.rule;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(at[0] + dx * 0.85, at[1] + dy - 4); ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const render = (progress: number) => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = colours.light ? 'source-over' : 'lighter';

    // Ground: a measured baseline with metre ticks, like the scan mat's grid.
    const gy = sy(0);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colours.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    for (let m = Math.ceil(view.x0); m <= view.x1; m += 0.5) {
      const x = sx(m);
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + (m % 1 === 0 ? 9 : 5)); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const frame = frameAt(progress);
    if (!data || !frame) return;

    // Ball trajectory so far: a dashed measured arc in optic yellow.
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = colours.ball;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    let started = false;
    const upto = Math.round(progress * (data.frames.length - 1));
    for (let i = 0; i <= upto; i++) {
      const b = data.frames[i].ball;
      if (!b || i < data.frames.length * 0.16) { started = false; continue; }
      const [x, y] = P(b);
      started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Motion trails for the racket and hitting wrist: the last ~18 frames.
    if (opts.figure) for (let k = 18; k >= 1; k--) {
      const prev = frameAt(Math.max(0, progress - k * 0.0045));
      const next = frameAt(Math.max(0, progress - (k - 1) * 0.0045));
      if (!prev || !next) continue;
      const fade = 1 - k / 19;
      neon(P(prev.joints.racket), P(next.joints.racket), colours.violet, 2, fade * 0.8);
      neon(P(prev.joints.wrR), P(next.joints.wrR), colours.ice, 1.5, fade * 0.5);
    }

    const j = frame.joints;
    const hipMid: Vec = [(j.hipL[0] + j.hipR[0]) / 2, (j.hipL[1] + j.hipR[1]) / 2];
    if (opts.figure) {
      const shMid: Vec = [(j.shL[0] + j.shR[0]) / 2, (j.shL[1] + j.shR[1]) / 2];

      // Far side dimmer than near side, so the figure reads as 3D.
      for (const [a, b, side] of BONES) {
        neon(P(j[a]), P(j[b]), colours.ice, side === 'far' ? 2.4 : 3.2, side === 'far' ? 0.5 : 1);
      }
      neon(P(j.neck), P(shMid), colours.ice, 3.2, 1);
      neon(P(shMid), P(hipMid), colours.ice, 3.2, 1);

      // Racket: shaft from the hitting wrist, oval head at the tip.
      const w = P(j.wrR), r = P(j.racket);
      neon(w, r, colours.violet, 2.4, 1);
      const ang = Math.atan2(r[1] - w[1], r[0] - w[0]);
      const len = Math.hypot(r[0] - w[0], r[1] - w[1]);
      ctx.save();
      ctx.translate(r[0] - Math.cos(ang) * len * 0.22, r[1] - Math.sin(ang) * len * 0.22);
      ctx.rotate(ang);
      ctx.strokeStyle = colours.violet;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.26, len * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      for (const name of ['head', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR'] as Joint[]) {
        dot(P(j[name]), name === 'head' ? 7 : 3.2, colours.fg, 3.2);
      }

    }

    if (frame.ball) dot(P(frame.ball), 6, colours.ball, 4.5);

    ctx.globalCompositeOperation = 'source-over';

    // Telemetry: joint angles computed from the frame — real numbers when the
    // data is real, and labelled synthetic when it isn't.
    if (opts.figure) {
      const shoulder = angle(j.elR, j.shR, hipMid);
      const knee = angle(j.hipL, j.knL, j.anL);
      label(`R shoulder ${shoulder.toFixed(0)}°`, P(j.shR), -70, -14);
      label(`L knee ${knee.toFixed(0)}°`, P(j.knL), 64, 6);
    }
    if (frame.ball) label(`ball ${frame.ball[1].toFixed(2)} m`, P(frame.ball), 52, -12, colours.ball);

    // Phase readout and progress bar, top-left of the stage.
    let phase = PHASES[0][1];
    for (const [t, name] of PHASES) if (progress >= t) phase = name;
    ctx.font = `600 ${Math.max(11, Math.round(H * 0.018))}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = colours.fg;
    ctx.textAlign = 'right';
    ctx.fillText(phase.toUpperCase(), W - 24, 40);
    ctx.fillStyle = colours.rule;
    ctx.fillRect(W - 184, 52, 160, 2);
    ctx.fillStyle = colours.ice;
    ctx.fillRect(W - 184, 52, 160 * progress, 2);
  };

  resize();
  return { render, resize };
}
