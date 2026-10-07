/**
 * Project model viewer: an orbitable 3D object rendered as a hologram — crisp
 * CAD edges, a fresnel glass body, and a scan line sweeping through it.
 *
 * This module pulls in three.js (~170 KB gz) and is only ever loaded with a
 * dynamic import from project pages, after the text has painted. The home page
 * never downloads it.
 *
 * Accessibility:
 *  - the canvas is keyboard-operable (arrow keys orbit, Home resets) and labelled
 *  - auto-rotation has a visible pause control (WCAG 2.2.2) and never runs with
 *    prefers-reduced-motion; orbiting by hand still works, since the user moves it
 *  - wheel zoom is OFF, so scrolling the page is never hijacked by the canvas
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vView = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uIce;
uniform vec3 uViolet;
uniform float uSweep;
uniform float uLight;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
  vec3 col = mix(uViolet * 0.35, uIce, fres);
  float alpha = 0.16 + fres * 0.7;
  // Scan line: a bright band travelling up through the object.
  float band = smoothstep(0.035, 0.0, abs(vWorld.y - uSweep));
  col += uIce * band * 1.4;
  alpha = max(alpha, band * 0.9);
  if (uLight > 0.5) { col = mix(vec3(0.9), uIce, 0.35 + fres * 0.5); alpha *= 0.85; }
  gl_FragColor = vec4(col, alpha);
}
`;

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export interface ViewerHandle { dispose(): void }

export interface ViewerOptions {
  /**
   * 'full': the case-study viewer — drag, arrow keys, pause and reset buttons.
   * 'card': a compact live preview inside a project card. The card is a link,
   *         so there's no drag; the model follows the pointer instead.
   */
  mode?: 'full' | 'card';
  /** The element whose pointer movement drives the scan line. Defaults to the canvas. */
  pointerSurface?: HTMLElement | null;
}

export async function mountViewer(host: HTMLElement, opts: ViewerOptions = {}): Promise<ViewerHandle | null> {
  const mode = opts.mode ?? 'full';
  const src = host.dataset.src!;
  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
  const pauseBtn = host.querySelector<HTMLButtonElement>('[data-viewer-pause]');
  const resetBtn = host.querySelector<HTMLButtonElement>('[data-viewer-reset]');
  const status = host.querySelector<HTMLElement>('[data-viewer-status]');

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    host.classList.add('viewer--failed');
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(2.2, 1.35, 2.6);

  // ---- geometry ---------------------------------------------------------
  let geometry: THREE.BufferGeometry;
  try {
    if (src.toLowerCase().endsWith('.stl')) {
      geometry = await new STLLoader().loadAsync(src);
      geometry.rotateX(-Math.PI / 2); // STL files are Z-up; three.js is Y-up
    } else {
      const gltf = await new GLTFLoader().loadAsync(src);
      const meshes: THREE.BufferGeometry[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const g = (o as THREE.Mesh).geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          meshes.push(g);
        }
      });
      if (!meshes.length) throw new Error('model has no meshes');
      geometry = meshes[0];
    }
  } catch (e) {
    console.warn('viewer: could not load model', e);
    host.classList.add('viewer--failed');
    renderer.dispose();
    return null;
  }

  // Centre on the floor and normalise to ~1.6 units across, whatever the units.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3(); box.getSize(size);
  const centre = new THREE.Vector3(); box.getCenter(centre);
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  const k = 1.6 / Math.max(size.x, size.y, size.z);
  geometry.scale(k, k, k);
  geometry.computeVertexNormals();
  const height = size.y * k;

  const uniforms = {
    uIce: { value: new THREE.Color(css('--ice', '#4DF3FF')) },
    uViolet: { value: new THREE.Color(css('--violet', '#8B5CFF')) },
    uSweep: { value: 0 },
    uLight: { value: document.documentElement.dataset.theme === 'light' ? 1 : 0 },
  };

  const body = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  const rig = new THREE.Group();
  scene.add(rig);
  rig.add(body);

  const edgeMat = new THREE.LineBasicMaterial({ color: css('--ice', '#4DF3FF'), transparent: true, opacity: 0.85 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), edgeMat);
  rig.add(edges);

  // Measurement floor: a grid like the scan mat, fading out radially.
  const grid = new THREE.GridHelper(4, 32, css('--rule', '#5B677B'), css('--rule', '#5B677B'));
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.32;
  scene.add(grid);

  const target = new THREE.Vector3(0, height * 0.42, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;           // never steal the page scroll
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.autoRotateSpeed = 0.6;   // slow reads as considered; fast reads as busy
  if (mode === 'card') {
    // Pull the camera in to match the card still's crop, and no drag: the card
    // is a link, and a drag would fight the click.
    camera.position.copy(target.clone().add(camera.position.clone().sub(target).multiplyScalar(0.74)));
    controls.enableRotate = false;
  }
  controls.update();
  const home = { pos: camera.position.clone() };

  // ---- motion & controls -------------------------------------------------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  try { if (localStorage.getItem('motion') === 'paused') paused = true; } catch { /* storage blocked */ }

  const syncPause = () => {
    // Card previews never spin on their own: on a busy page they'd compete with
    // everything else. They move only when the pointer does.
    controls.autoRotate = mode === 'full' && !paused && !reduced.matches;
    if (pauseBtn) {
      pauseBtn.hidden = reduced.matches;
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.textContent = paused ? 'Rotate' : 'Pause rotation';
    }
  };
  syncPause();
  pauseBtn?.addEventListener('click', () => { paused = !paused; syncPause(); wake(); });
  resetBtn?.addEventListener('click', () => {
    camera.position.copy(home.pos); controls.target.copy(target); controls.update(); wake();
  });

  // Keyboard orbit for people who can't drag (full viewer only).
  if (mode === 'full') canvas.addEventListener('keydown', (e) => {
    const step = 0.18;
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (e.key === 'ArrowLeft') sph.theta -= step;
    else if (e.key === 'ArrowRight') sph.theta += step;
    else if (e.key === 'ArrowUp') sph.phi = Math.max(controls.minPolarAngle, sph.phi - step);
    else if (e.key === 'ArrowDown') sph.phi = Math.min(controls.maxPolarAngle, sph.phi + step);
    else if (e.key === 'Home') { resetBtn?.click(); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    camera.position.copy(new THREE.Vector3().setFromSpherical(sph).add(controls.target));
    controls.update();
    wake();
  });

  window.addEventListener('themechange', () => {
    uniforms.uIce.value.set(css('--ice', '#4DF3FF'));
    uniforms.uViolet.value.set(css('--violet', '#8B5CFF'));
    uniforms.uLight.value = document.documentElement.dataset.theme === 'light' ? 1 : 0;
    edgeMat.color.set(document.documentElement.dataset.theme === 'light' ? css('--fg', '#1A1C1E') : css('--ice', '#4DF3FF'));
    wake();
  });

  // ---- loop: runs only while visible, and only while something is moving ---
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(() => { resize(); wake(); }).observe(canvas);
  resize();

  // ---- follow the pointer ------------------------------------------------
  // Anywhere on the page: the object leans toward the cursor. Over the viewer:
  // the scan line tracks the cursor's height, so you scan it with your mouse.
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let hovering = false, scanTarget = height * 0.5;

  const onPagePointer = (e: PointerEvent) => {
    if (reduced.matches || e.pointerType === 'touch') return;
    const r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tilt.ty = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * 0.5))) * 0.55;
    tilt.tx = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * 0.5))) * 0.22;
    wake();
  };
  const onStagePointer = (e: PointerEvent) => {
    if (reduced.matches) return;
    const r = canvas.getBoundingClientRect();
    const fy = (e.clientY - r.top) / r.height;          // 0 top .. 1 bottom
    // The object occupies roughly the middle band of the frame; map that band
    // onto its height so the line sits where the cursor is.
    scanTarget = Math.max(-0.02, Math.min(height * 1.05, (0.78 - fy) / 0.5 * height));
    hovering = true;
    wake();
  };
  const surface = opts.pointerSurface ?? canvas;
  window.addEventListener('pointermove', onPagePointer, { passive: true });
  surface.addEventListener('pointermove', onStagePointer, { passive: true });
  surface.addEventListener('pointerleave', () => { hovering = false; wake(); });

  let raf = 0, visible = true, idleFrames = 0;
  const timer = new THREE.Timer();
  const tick = () => {
    timer.update();
    const t = timer.getElapsed();
    tilt.x += (tilt.tx - tilt.x) * 0.06;
    tilt.y += (tilt.ty - tilt.y) * 0.06;
    rig.rotation.x = tilt.x;
    rig.rotation.y = tilt.y;
    const easing = Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.0005;

    const rest = height * 0.55;
    const before = uniforms.uSweep.value;
    if (reduced.matches) uniforms.uSweep.value = rest;
    else if (hovering) uniforms.uSweep.value += (scanTarget - before) * 0.18;
    // Full viewer: the scan line sweeps on its own (it has a pause control).
    else if (mode === 'full') uniforms.uSweep.value = ((t * 0.28) % 1.25) * height * 1.15 - height * 0.05;
    // Card: the line settles to rest and stays there.
    else uniforms.uSweep.value += (rest - before) * 0.12;
    const sweeping = (mode === 'full' && !reduced.matches && !hovering) || Math.abs(uniforms.uSweep.value - before) > 0.0005;

    const moved = controls.update();
    renderer.render(scene, camera);
    // Keep rendering only while something is actually moving; otherwise sleep.
    idleFrames = moved || easing || controls.autoRotate || sweeping ? 0 : idleFrames + 1;
    raf = visible && !document.hidden && idleFrames < 30 ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => { idleFrames = 0; if (!raf && visible) raf = requestAnimationFrame(tick); };
  controls.addEventListener('start', wake);

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? wake() : (cancelAnimationFrame(raf), (raf = 0)); });
  io.observe(host);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  host.classList.add('viewer--ready');
  if (status) status.textContent = 'Model loaded. Drag, or use the arrow keys, to turn it.';
  wake();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPagePointer);
      io.disconnect();
      controls.dispose();
      geometry.dispose();
      renderer.dispose();
    },
  };
}
