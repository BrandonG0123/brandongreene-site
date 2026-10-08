/**
 * The live scene for the About opening: everything after the opening video
 * hands over. One clock (score seconds) in, a few uniforms per frame out.
 *
 *   scan.ts     the scan line climbing the ball (over the video)
 *   points.ts   the scanned ball as points, flying out to feed each print
 *   print.ts    the six pieces printing in place round the ring
 *   centre.ts   threads back to the centre; the staircase lighting
 *
 * Setup runs in short steps that yield to the browser (the `step` callback),
 * so building it never holds the page up.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as E from './emblems';
import { printable, type Printable } from './print';
import { createPoints, type Points } from './points';
import { createCentre, type Centre } from './centre';
import { createScan, type Scan } from './scan';
import { layout, cameraAt, type Layout } from './layout';
import { SCORE, ORDER, printWindow, threadWindow, ramp, smooth } from './score';

/** How each piece faces the camera at rest: [yaw, pitch], chosen so it reads. */
const POSE: Record<E.Key, [number, number]> = {
  tennis: [-0.7, 0.1],
  school: [-0.55, 0.32],
  projects: [-0.5, 0.42],
  coding: [-0.28, 0.1],
  hobbies: [0.35, 0.22],
  mind: [-0.35, 0.05],
};
const COLOR: Record<E.Key, string> = {
  tennis: '#cfe81f', school: '#c9cfd8', projects: '#c9cfd8', coding: '#c9cfd8', hobbies: '#8f98a6', mind: '#c9cfd8',
};

export interface SceneState {
  lean: { x: number; y: number };
  /** Per piece: 0 closed … 1 open (hovered, focused or tapped). */
  open: number[];
  /** Turns for open pieces (they turn while you look at them), and the staircase's turn. */
  spin: number[];
  turn: number;
}

export interface OrbitScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  layout: Layout;
  resize(W: number, H: number, dpr: number): void;
  apply(t: number, s: SceneState): void;
  render(): void;
  /** Compile every shader up front, off the main thread where the browser can. */
  compile(): Promise<void>;
  /** For the stills: show one piece (or the centre) alone, whole, filling the frame. */
  isolate(which: E.Key | 'centre'): void;
  /** Screen position (px) of piece k's centre, its radius in px, and the staircase's foot. */
  pieceScreen(k: number): { x: number; y: number; r: number };
  centreScreen(): { x: number; y: number };
  dispose(): void;
}

export async function createScene(
  canvas: HTMLCanvasElement,
  opts: { small: boolean; meshUrl: string; preserve?: boolean; step: (name: string) => Promise<void> },
): Promise<OrbitScene | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.22;
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 80);
  await opts.step('environment');

  // Light: a warm key from the upper left, the site's ice as a rim from behind,
  // a breath of violet fill (the 3D atmosphere colour).
  const key = new THREE.DirectionalLight('#fff3e2', 2.6);
  key.position.set(-5, 4, 2.6);
  const rim = new THREE.DirectionalLight('#4DF3FF', 2.0);
  rim.position.set(3, 2, -4);
  const fill = new THREE.DirectionalLight('#8B5CFF', 0.45);
  fill.position.set(-4, -1, 1);
  scene.add(key, rim, fill);

  // ---- the pieces ----------------------------------------------------------------
  const geometries: Record<E.Key, THREE.BufferGeometry> = {
    tennis: E.tennis(),
    school: E.school(),
    projects: await E.projects(opts.meshUrl),
    coding: E.coding(),
    hobbies: E.hobbies(),
    mind: E.mind(),
  };
  await opts.step('pieces');
  const pieces: { key: E.Key; group: THREE.Group; inner: THREE.Group; print: Printable }[] = ORDER.map((key) => {
    const print = printable(geometries[key], { color: COLOR[key], seamColor: '#f2f1ea', layers: opts.small ? 48 : 66 });
    const inner = new THREE.Group();
    inner.add(print.mesh, print.ghost);
    inner.rotation.set(POSE[key][1], POSE[key][0], 0, 'YXZ');
    const group = new THREE.Group();
    group.add(inner);
    scene.add(group);
    return { key, group, inner, print };
  });
  await opts.step('print');

  const centre: Centre = createCentre();
  scene.add(centre.group);
  const scan: Scan = createScan();
  scene.add(scan.group);

  // The points need the pieces placed (they aim at them), so lay out first.
  let L = layout(16, 9);
  const placePieces = () => {
    pieces.forEach((p, k) => {
      p.group.position.copy(L.slots[k]);
      p.group.scale.setScalar(L.size);
      p.group.updateMatrixWorld(true);
    });
    // Clockwise from the first piece: at 120° on wide screens, the top on tall ones.
    centre.place(L.centre, L.centreScale, L.slots, L.size, { ...L.orbit, start: L.tall ? Math.PI / 2 : (Math.PI * 2) / 3 });
  };
  placePieces();
  const targets = () => pieces.map((p, k) => ({
    geometry: geometries[p.key],
    matrix: p.inner.matrixWorld.clone(),
    window: printWindow(k),
    heightFraction: (y: number) => p.print.heightFraction(y),
  }));
  const points: Points = createPoints(opts.small ? 9000 : 20000, targets());
  scene.add(points.points);
  await opts.step('points');

  let W = 1, H = 1;
  const v = new THREE.Vector3();
  const screen = (p: THREE.Vector3) => {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  };

  return {
    renderer,
    camera,
    get layout() { return L; },
    resize(w, h, dpr) {
      W = Math.max(1, w); H = Math.max(1, h);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      L = layout(W, H);
      placePieces();
      points.retarget(targets());
      const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
      points.uniforms.uPx.value = buf.y / (2 * Math.tan((30 * Math.PI) / 360));
    },
    apply(t, s) {
      cameraAt(camera, L, t, s.lean);
      scan.set(t);
      points.uniforms.uT.value = t;
      points.points.visible = t > SCORE.scan[0] - 0.05 && t < SCORE.printStart + 6 * SCORE.printStagger + SCORE.printDur + 0.1;

      pieces.forEach((p, k) => {
        const [a, b] = printWindow(k);
        const pr = ramp(t, a, b);
        // The outline appears a moment before the plastic, and goes once it's whole.
        const ghost = ramp(t, a - 0.55, a - 0.1) * (1 - ramp(t, b, b + 0.35));
        // A flash as this piece sends its thread to the centre.
        const sent = t - threadWindow(k)[0];
        p.print.set(pr, ghost, sent > 0 ? Math.exp(-sent * 3.2) * Math.min(1, sent * 12) : 0);
        const o = smooth(s.open[k] ?? 0);
        // An open piece lifts toward you and turns while you look at it.
        p.group.position.copy(L.slots[k]).add(v.set(0, 0, o * 0.25));
        p.group.scale.setScalar(L.size * (1 + o * 0.05));
        p.inner.rotation.y = POSE[p.key][0] + (s.spin[k] ?? 0);
      });

      const heads = ORDER.map((_, k) => {
        const [a, b] = threadWindow(k);
        return (t - a) / (b - a);
      });
      const [l0, l1] = SCORE.stepsLit;
      // The orbit is drawn piece to piece as they print, finishing as the last one does.
      const draw = ramp(t, SCORE.printStart, printWindow(ORDER.length - 1)[1]);
      centre.set(draw, heads, ramp(t, l0, l1) * centre.count, s.turn);
    },
    render() { renderer.render(scene, camera); },
    async compile() { await renderer.compileAsync(scene, camera); },
    isolate(which) {
      points.points.visible = false;
      scan.group.visible = false;
      let target: THREE.Vector3, size: number;
      pieces.forEach((p) => {
        const on = p.key === which;
        p.group.visible = on;
        p.print.set(1, 0);
        p.inner.rotation.y = POSE[p.key][0];
      });
      if (which === 'centre') {
        centre.set(0, ORDER.map(() => 2), 20, 0.6);
        centre.group.visible = true;
        target = L.centre.clone();
        size = L.centreScale * 1.4;
      } else {
        centre.group.visible = false;
        const k = ORDER.indexOf(which);
        target = L.slots[k].clone();
        size = L.size * 1.45;
        pieces[k].group.position.copy(target);
        pieces[k].group.scale.setScalar(L.size);
      }
      camera.fov = 30;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      camera.position.copy(target).add(v.set(0, size * 0.35, size / Math.tan((15 * Math.PI) / 180)));
      camera.lookAt(target);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    },
    pieceScreen(k) {
      const p = screen(pieces[k].group.position);
      return { ...p, r: L.size * L.pxPerWorld * (pieces[k].group.scale.x / L.size) };
    },
    centreScreen() { return screen(centre.foot()); },
    dispose() {
      pieces.forEach((p) => { p.print.dispose(); geometries[p.key].dispose(); });
      points.dispose(); centre.dispose(); scan.dispose();
      env.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
