/**
 * The scanned ball as points, and their trip to the ring.
 *
 * Each point is born where the scan line crosses the felt, glowing white, and
 * cools to ice as it's pushed out from the ball. Then it flies to a spot on
 * one of the six pieces and arrives exactly as the print front reaches that
 * spot's layer, heating up as it lands: the points are the plastic.
 *
 * Points and targets are paired in time order (the first scanned feed the
 * first layers printed), so nothing has to rush. All timing is precomputed;
 * the vertex shader places each point from the clock alone.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { rng } from '../intro/shapes';
import { BALL_R } from './layout';
import { orientationAt, scanTime, BASE } from './ball';

const VERT = /* glsl */ `
attribute vec3 aRelease;   // world position when the scan line passed
attribute vec3 aNormal;    // outward from the ball there
attribute vec3 aTarget;    // world position on its piece
attribute vec4 aTime;      // scanned, departs, arrives, seed
uniform float uT, uPx, uSize;
varying vec3 vColor;
varying float vAlpha;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 hover(float age) {
  // Pushed out from the ball, sinking a touch, still turning with it.
  float out_ = 0.04 + 0.34 * (1.0 - exp(-age * 1.3));
  return rotY(aRelease + aNormal * out_ + vec3(0.0, -0.035 * age, 0.0), 0.16 * age);
}

void main() {
  float ts = aTime.x, td = aTime.y, ta = aTime.z, seed = aTime.w;
  if (uT < ts || uT >= ta) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float age = uT - ts;
  vec3 p;
  float s = 0.0;
  if (uT < td) {
    p = hover(age);
  } else {
    vec3 a = hover(td - ts);
    s = (uT - td) / (ta - td);
    float e = s < 0.5 ? 4.0 * s * s * s : 1.0 - pow(-2.0 * s + 2.0, 3.0) / 2.0;
    vec3 side = normalize(vec3(sin(seed * 71.0), cos(seed * 53.0), sin(seed * 37.0) * 0.5 + 0.8));
    vec3 c = mix(a, aTarget, 0.5) + side * length(aTarget - a) * 0.28;
    p = mix(mix(a, c, e), mix(c, aTarget, e), e);
  }
  float fresh = exp(-age * 5.0);
  vec3 ice = vec3(0.30, 0.95, 1.0);
  vec3 col = mix(ice, vec3(1.0), fresh * 0.85);
  float land = smoothstep(0.7, 1.0, s);
  col = mix(col, vec3(1.0, 0.66, 0.32) * 1.4, land);
  vColor = col;
  vAlpha = 0.62 + fresh * 0.6 + land * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uSize * (0.75 + fract(seed * 13.7) * 0.5) * (1.0 + fresh * 0.9) * (1.0 - land * 0.45);
  gl_PointSize = clamp(size * uPx / -mv.z, 0.0, 22.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.06, d);
  vec3 c = vColor * a * vAlpha;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

export interface PieceTarget {
  /** The piece's geometry in its own space, and its world matrix. */
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  /** When its print runs, and which fraction of its height a local y is. */
  window: [number, number];
  heightFraction(y: number): number;
}

export interface Points {
  points: THREE.Points;
  uniforms: Record<string, THREE.IUniform>;
  /** Re-aim at the pieces after a resize moved them. */
  retarget(pieces: PieceTarget[]): void;
  dispose(): void;
}

export function createPoints(n: number, pieces: PieceTarget[]): Points {
  const rand = rng(41);
  // Ball points: uniform on the sphere, in time order of the scan.
  const balls: { release: THREE.Vector3; normal: THREE.Vector3; ts: number }[] = [];
  const d = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    d.set(r * Math.cos(th), u, r * Math.sin(th));
    // Height is fixed through the scan (the ball turns about Y), so the base tilt alone sets it.
    w.copy(d).applyQuaternion(BASE);
    const ts = scanTime(w.y * BALL_R);
    const normal = d.clone().applyQuaternion(orientationAt(ts, q));
    balls.push({ release: normal.clone().multiplyScalar(BALL_R), normal, ts });
  }
  balls.sort((a, b) => a.ts - b.ts);

  // Targets: samples on each piece, an equal share each, tagged with when the
  // print front reaches them.
  const per = Math.floor(n / pieces.length);
  const local: { piece: number; p: THREE.Vector3; ta: number }[] = [];
  const v = new THREE.Vector3();
  pieces.forEach((pc, k) => {
    const sampler = (new MeshSurfaceSampler(new THREE.Mesh(pc.geometry)) as MeshSurfaceSampler & {
      setRandomGenerator(f: () => number): MeshSurfaceSampler;
    }).setRandomGenerator(rng(50 + k)).build();
    const count = k === pieces.length - 1 ? n - per * (pieces.length - 1) : per;
    for (let i = 0; i < count; i++) {
      sampler.sample(v);
      const [a, b] = pc.window;
      local.push({ piece: k, p: v.clone(), ta: a + Math.max(0, Math.min(1, pc.heightFraction(v.y))) * (b - a) });
    }
  });
  local.sort((a, b) => a.ta - b.ta);

  const release = new Float32Array(n * 3), normal = new Float32Array(n * 3), target = new Float32Array(n * 3), time = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const b = balls[i], t = local[i], seed = rand();
    release.set([b.release.x, b.release.y, b.release.z], 3 * i);
    normal.set([b.normal.x, b.normal.y, b.normal.z], 3 * i);
    const travel = 0.75 + seed * 0.45;
    const td = Math.max(b.ts + 0.28, t.ta - travel);
    time.set([b.ts, Math.min(td, t.ta - 0.2), t.ta, seed], 4 * i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(release, 3)); // unused by the shader; keeps three happy
  geo.setAttribute('aRelease', new THREE.BufferAttribute(release, 3));
  geo.setAttribute('aNormal', new THREE.BufferAttribute(normal, 3));
  const targetAttr = new THREE.BufferAttribute(target, 3);
  geo.setAttribute('aTarget', targetAttr);
  geo.setAttribute('aTime', new THREE.BufferAttribute(time, 4));

  const uniforms = { uT: { value: 0 }, uPx: { value: 800 }, uSize: { value: 0.012 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false,
    // Light that only adds (see shapes.ts glowBlending): opacity never paints dark marks.
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const retarget = (pcs: PieceTarget[]) => {
    for (let i = 0; i < n; i++) {
      const t = local[i];
      v.copy(t.p).applyMatrix4(pcs[t.piece].matrix);
      target[3 * i] = v.x; target[3 * i + 1] = v.y; target[3 * i + 2] = v.z;
    }
    targetAttr.needsUpdate = true;
  };
  retarget(pieces);

  return { points, uniforms, retarget, dispose() { geo.dispose(); mat.dispose(); } };
}
