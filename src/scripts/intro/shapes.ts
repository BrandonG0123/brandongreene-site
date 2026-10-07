/**
 * The shapes the intro's point cloud passes through, sampled once at load into
 * flat Float32Arrays of N points each (x, y, z per point).
 *
 * Every shape is something Brandon does, and the only external model is the
 * foot scanner's real calibration object. Each shape is centred and scaled to
 * fit a sphere of radius 1; the scene scales them.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export type Cloud = Float32Array;

/**
 * Light that only ever adds. Plain additive blending also writes full opacity,
 * which on a transparent canvas paints faint dark marks (black, but opaque)
 * over the page behind; here colour adds and opacity grows only with the light.
 */
export function glowBlending(m: THREE.Material) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

/** Deterministic random numbers, so every visit draws the same shapes. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centre a cloud on its bounding box and scale it to fit a unit sphere. */
function normalise(c: Cloud, report?: (mid: number[], r: number) => void): Cloud {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.length; i += 3)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[i + k]); max[k] = Math.max(max[k], c[i + k]); }
  const mid = min.map((m, k) => (m + max[k]) / 2);
  let r = 0;
  for (let i = 0; i < c.length; i += 3)
    r = Math.max(r, Math.hypot(c[i] - mid[0], c[i + 1] - mid[1], c[i + 2] - mid[2]));
  for (let i = 0; i < c.length; i += 3) {
    c[i] = (c[i] - mid[0]) / r;
    c[i + 1] = (c[i + 1] - mid[1]) / r;
    c[i + 2] = (c[i + 2] - mid[2]) / r;
  }
  report?.(mid, r);
  return c;
}

const area = (g: THREE.BufferGeometry) => {
  const p = g.attributes.position, idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  const tris = idx ? idx.count / 3 : p.count / 3;
  for (let t = 0; t < tris; t++) {
    const [i, j, k] = idx ? [idx.getX(3 * t), idx.getX(3 * t + 1), idx.getX(3 * t + 2)] : [3 * t, 3 * t + 1, 3 * t + 2];
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, j); c.fromBufferAttribute(p, k);
    sum += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return sum;
};

/** Uniform points over the surfaces of several geometries, split by area. */
function sampleSurfaces(geos: THREE.BufferGeometry[], n: number, seed: number): Cloud {
  const out = new Float32Array(n * 3);
  const areas = geos.map(area), total = areas.reduce((s, a) => s + a, 0);
  const rand = rng(seed);
  const v = new THREE.Vector3();
  let o = 0;
  geos.forEach((g, gi) => {
    const count = gi === geos.length - 1 ? n - o / 3 : Math.round((n * areas[gi]) / total);
    // setRandomGenerator exists in three.js but is missing from its type definitions.
    const sampler = (new MeshSurfaceSampler(new THREE.Mesh(g)) as MeshSurfaceSampler & {
      setRandomGenerator(f: () => number): MeshSurfaceSampler;
    }).setRandomGenerator(rand).build();
    for (let i = 0; i < count; i++, o += 3) {
      sampler.sample(v);
      out[o] = v.x; out[o + 1] = v.y; out[o + 2] = v.z;
    }
  });
  return out;
}

// ---- the tennis ball --------------------------------------------------------

/**
 * The seam of a tennis ball: two interlocking lobes on the sphere.
 * x = a cos t + b cos 3t, y = a sin t − b sin 3t, z = 2√(ab) sin 2t with a + b = 1
 * lies exactly on the unit sphere. Tilted so it reads as a ball, not a logo.
 */
export const SEAM_TILT = new THREE.Euler(0.55, 0.3, 0.2);
export function seamPoint(t: number, out = new THREE.Vector3()) {
  const a = 0.72, b = 0.28;
  out.set(a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t));
  return out.applyEuler(SEAM_TILT);
}

/**
 * Where the burn starts and how it spreads: angular distance from an ignition
 * point low on the ball, with a ragged edge. The SAME function runs in the ball
 * shader (BURN_GLSL), so the points released by the flames leave from exactly
 * where the felt burns away.
 */
const IGN = new THREE.Vector3(0.25, -0.9, 0.36).normalize();
export function burnThreshold(x: number, y: number, z: number) {
  const d = Math.max(-1, Math.min(1, x * IGN.x + y * IGN.y + z * IGN.z));
  const w = Math.sin(7.1 * x + 3.3 * y) * Math.sin(5.3 * y - 2.1 * z) * Math.sin(6.7 * z + 1.7 * x);
  return Math.max(0, Math.min(1, (Math.acos(d) / Math.PI) * 0.86 + 0.07 + w * 0.07));
}
export const BURN_GLSL = /* glsl */ `
float burnThreshold(vec3 n) {
  vec3 ign = normalize(vec3(${IGN.x.toFixed(5)}, ${IGN.y.toFixed(5)}, ${IGN.z.toFixed(5)}));
  float a = acos(clamp(dot(n, ign), -1.0, 1.0)) / 3.14159265;
  float w = sin(7.1 * n.x + 3.3 * n.y) * sin(5.3 * n.y - 2.1 * n.z) * sin(6.7 * n.z + 1.7 * n.x);
  return clamp(a * 0.86 + 0.07 + w * 0.07, 0.0, 1.0);
}`;

/** Points on the unit sphere, about one in eight on the seam so it still shows as points. */
export function ball(n: number, seed = 11): Cloud {
  const out = new Float32Array(n * 3), rand = rng(seed), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (rand() < 0.12) {
      seamPoint(rand() * Math.PI * 2, v);
    } else {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      v.set(s * Math.cos(th), u, s * Math.sin(th));
    }
    out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z;
  }
  return out;
}

// ---- the chess knight ---------------------------------------------------------

/** A turned base and a carved head in profile, bevelled: a Staunton-ish knight. */
export function knightGeometries(): THREE.BufferGeometry[] {
  const base = new THREE.LatheGeometry(
    [
      [0.0, 0.0], [0.46, 0.0], [0.47, 0.035], [0.44, 0.07], [0.4, 0.085], [0.38, 0.12],
      [0.33, 0.15], [0.3, 0.19], [0.32, 0.22], [0.3, 0.25], [0.24, 0.27], [0.0, 0.27],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  );

  // Head, facing +x: the mane swelling down the back, two ears, the brow, a
  // long face to a rounded nose, the mouth, the jaw, and the chest pushing
  // forward over the collar.
  const s = new THREE.Shape();
  s.moveTo(-0.25, 0.27);
  s.bezierCurveTo(-0.36, 0.45, -0.34, 0.64, -0.24, 0.79); // mane
  s.bezierCurveTo(-0.2, 0.86, -0.15, 0.95, -0.11, 1.08); // back ear
  s.lineTo(-0.04, 0.97);
  s.lineTo(0.03, 1.07); // front ear
  s.bezierCurveTo(0.07, 1.0, 0.12, 0.96, 0.17, 0.93); // brow
  s.bezierCurveTo(0.25, 0.88, 0.36, 0.78, 0.41, 0.7); // face
  s.bezierCurveTo(0.46, 0.63, 0.45, 0.56, 0.4, 0.54); // nose
  s.lineTo(0.27, 0.57); // mouth
  s.lineTo(0.33, 0.51);
  s.bezierCurveTo(0.27, 0.46, 0.17, 0.45, 0.1, 0.5); // jaw
  s.bezierCurveTo(0.05, 0.44, 0.25, 0.39, 0.24, 0.27); // throat and chest
  s.lineTo(-0.25, 0.27);

  const head = new THREE.ExtrudeGeometry(s, {
    depth: 0.3, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 6, curveSegments: 32,
  });
  head.translate(0, 0, -0.15);
  return [base, head];
}

export function knight(n: number, seed = 12): Cloud {
  return normalise(sampleSurfaces(knightGeometries(), n, seed));
}

// ---- the foot scanner's calibration object (the real STL) -----------------

/**
 * The STL is 815 KB (339 KB compressed); the intro only needs points. So it is
 * sampled offline (`npm run render:about` → scripts/sample-intro-points.mjs)
 * into int16 triples, ~120 KB, and the page loads that.
 */
export const CALIBRATION_POINTS = 20000;

export function calibrationFromSTL(stl: ArrayBuffer, n = CALIBRATION_POINTS, seed = 13): Cloud {
  const g = new STLLoader().parse(stl);
  g.rotateX(-Math.PI / 2); // STL is Z-up; three.js is Y-up
  return normalise(sampleSurfaces([g], n, seed));
}

export function encodeCloud(c: Cloud): Int16Array {
  const q = new Int16Array(c.length);
  for (let i = 0; i < c.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, c[i])) * 32767);
  return q;
}

/** The first n points of the pre-sampled object (they're in random order, so any prefix is uniform). */
export async function calibration(n: number, url: string): Promise<Cloud> {
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`calibration points: ${r.status}`);
    return r.arrayBuffer();
  });
  const q = new Int16Array(buf), have = q.length / 3, out = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = q[i % (have * 3)] / 32767;
  return out;
}

// ---- machine learning: a small network -------------------------------------

export const LAYERS = [4, 6, 6, 3];

/** Node centres of the network, in the same unit space the points use. */
export function networkNodes(): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  const rand = rng(14);
  LAYERS.forEach((count, l) => {
    const x = -0.9 + (1.8 * l) / (LAYERS.length - 1);
    for (let i = 0; i < count; i++) {
      const y = (i - (count - 1) / 2) * 0.32;
      nodes.push(new THREE.Vector3(x, y, (rand() - 0.5) * 0.25));
    }
  });
  return nodes;
}

/** Every connection between consecutive layers, as index pairs into networkNodes(). */
export function networkEdges(): [number, number][] {
  const edges: [number, number][] = [];
  let start = 0;
  for (let l = 0; l < LAYERS.length - 1; l++) {
    const next = start + LAYERS[l];
    for (let i = 0; i < LAYERS[l]; i++) for (let j = 0; j < LAYERS[l + 1]; j++) edges.push([start + i, next + j]);
    start = next;
  }
  return edges;
}

/**
 * Two thirds of the points crowd the nodes; the rest run along the connections.
 * Also returns the nodes in the same normalised space, for the drawn lines.
 */
export function network(n: number, seed = 15): { cloud: Cloud; nodes: THREE.Vector3[] } {
  const nodes = networkNodes(), edges = networkEdges(), rand = rng(seed);
  const out = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (rand() < 0.66) {
      const c = nodes[Math.floor(rand() * nodes.length)];
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 0.075 * Math.cbrt(rand());
      v.set(c.x + r * s * Math.cos(th), c.y + r * u, c.z + r * s * Math.sin(th));
    } else {
      const [a, b] = edges[Math.floor(rand() * edges.length)];
      v.lerpVectors(nodes[a], nodes[b], rand());
    }
    out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z;
  }
  let mid = [0, 0, 0], r = 1;
  normalise(out, (m, rr) => { mid = m; r = rr; });
  return { cloud: out, nodes: nodes.map((p) => new THREE.Vector3((p.x - mid[0]) / r, (p.y - mid[1]) / r, (p.z - mid[2]) / r)) };
}

// ---- mathematics: the gyroid from the home page ----------------------------

/**
 * The same surface the hero renders: sin x cos z + sin y cos x + sin z cos y = 0
 * (in the shader, dot(sin(r), cos(r.zxy))), cut to a cube. Points are found by
 * rejection and nudged onto the surface with one Newton step.
 */
export function gyroid(n: number, seed = 16): Cloud {
  const out = new Float32Array(n * 3), rand = rng(seed), k = 4.8;
  let i = 0;
  while (i < n) {
    // A cube of it: straight edges make the channels legible as it turns.
    const x = (rand() * 2 - 1) * 0.8, y = (rand() * 2 - 1) * 0.8, z = (rand() * 2 - 1) * 0.8;
    const X = x * k, Y = y * k, Z = z * k;
    const f = Math.sin(X) * Math.cos(Z) + Math.sin(Y) * Math.cos(X) + Math.sin(Z) * Math.cos(Y);
    if (Math.abs(f) > 0.05) continue;
    const gx = Math.cos(X) * Math.cos(Z) - Math.sin(Y) * Math.sin(X);
    const gy = Math.cos(Y) * Math.cos(X) - Math.sin(Z) * Math.sin(Y);
    const gz = Math.cos(Z) * Math.cos(Y) - Math.sin(X) * Math.sin(Z);
    const g2 = gx * gx + gy * gy + gz * gz || 1;
    out[3 * i] = (X - (f * gx) / g2) / k;
    out[3 * i + 1] = (Y - (f * gy) / g2) / k;
    out[3 * i + 2] = (Z - (f * gz) / g2) / k;
    i++;
  }
  return normalise(out);
}
