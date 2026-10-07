/**
 * The point cloud that carries the story. Every point is an ember first: it
 * leaves the ball the moment the burn reaches its spot, glowing orange, then
 * cools to ice blue and flies on. It passes through knight → printed and scanned
 * calibration object → network → gyroid, and ends in one of the five
 * constellation pieces.
 *
 * Each point holds all of its destinations as attributes. The vertex shader
 * works out where it is from time alone, so the CPU sets a few uniforms per
 * frame and nothing else. Transitions are staggered per point: the object is
 * "printed" in layers from the bottom up, the network wires in at random, the
 * gyroid grows from the centre, and the explosion bursts outward before settling.
 */
import * as THREE from 'three';
import { BALL_RADIUS } from './ball';
import { burnThreshold, glowBlending, rng } from './shapes';

export interface Timing {
  ignite: number; burnDur: number; spin: number;
  ember: number; fly1: number;
  start: [number, number, number, number];   // knight→print, →network, →gyroid, →constellation
  spread: [number, number, number, number];
  dur: [number, number, number, number];
}

const VERT = /* glsl */ `
uniform float uT;
uniform float uIgnite, uBurnDur, uSpin, uEmber, uFly1;
uniform vec4 uStart, uSpread, uDur;
uniform float uTurn;        // turntable angle for the shapes
uniform float uScale;       // world size of the shapes
uniform float uCalTilt;     // tip the flat calibration object toward the camera
uniform float uBurst;       // how far the explosion throws points
uniform float uScanY, uScanOn;
uniform float uWaveX, uWaveOn;
uniform float uHover, uHoverSpin;
uniform vec3 uSlots[5];
uniform float uPxPerUnit, uSize;
uniform float uFocus;       // camera distance: points behind it dim, so shapes read in depth
attribute vec3 aT1, aT2, aT3, aT4, aT5;
attribute vec4 aDelay;      // per-stage stagger, 0–1
attribute vec4 aMisc;       // burn threshold, seed, piece index, size jitter
varying vec3 vColor;
varying float vAlpha;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
float ease(float x) { return x * x * (3.0 - 2.0 * x); }
vec3 swirl(float seed, float l, float amp) {
  return vec3(sin(seed * 91.7 + l * 5.0), cos(seed * 53.1 + l * 4.0), sin(seed * 37.3 - l * 6.0)) * amp * sin(3.14159 * l);
}
float stage(float start, float spread, float dur, float delay) {
  return clamp((uT - start - delay * spread) / dur, 0.0, 1.0);
}

void main() {
  float seed = aMisc.y;
  float release = uIgnite + aMisc.x * uBurnDur;
  float since = uT - release;

  // Ember: where its spot was on the turning ball when it caught, drifting up and out.
  vec3 dir = normalize(position);
  vec3 o = rotY(position, uSpin * release);
  float drift = clamp(since / uEmber, 0.0, 1.0);
  vec3 p = o + rotY(dir, uSpin * release) * 0.09 * drift + vec3(0.0, 0.16 * drift, 0.0);

  float l1 = clamp((since - uEmber * 0.55 - seed * 0.3) / uFly1, 0.0, 1.0);
  p = mix(p, rotY(aT1 * uScale, uTurn), ease(l1)) + swirl(seed, l1, 0.32);
  float l2 = stage(uStart.x, uSpread.x, uDur.x, aDelay.x);
  p = mix(p, rotY(rotX(aT2, uCalTilt) * uScale, uTurn), ease(l2)) + swirl(seed + 1.0, l2, 0.12);
  float l3 = stage(uStart.y, uSpread.y, uDur.y, aDelay.y);
  p = mix(p, rotY(aT3 * uScale, uTurn), ease(l3)) + swirl(seed + 2.0, l3, 0.3);
  float l4 = stage(uStart.z, uSpread.z, uDur.z, aDelay.z);
  p = mix(p, rotY(aT4 * uScale, uTurn), ease(l4)) + swirl(seed + 3.0, l4, 0.28);

  // Explosion: thrown outward, then settling into its constellation piece.
  float l5 = stage(uStart.w, uSpread.w, uDur.w, aDelay.w);
  vec3 out5 = normalize(p + vec3(0.0001)) * uBurst * sin(3.14159 * min(1.0, l5 * 1.15));
  int piece = int(aMisc.z + 0.5);
  vec3 slot = uSlots[piece];
  bool hot = abs(aMisc.z - uHover) < 0.5;
  vec3 fin = aT5;
  if (hot) fin = slot + rotY(aT5 - slot, uHoverSpin);
  float e5 = 1.0 - pow(1.0 - l5, 3.0);
  p = mix(p, fin, e5) + out5;

  // Colour: white-hot ember cooling to ice, then highlights per stage.
  vec3 ice = vec3(0.30, 0.95, 1.0);
  float heat = 1.0 - smoothstep(0.0, 1.0, since);
  vec3 ember = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.9, 0.62), heat * heat);
  vec3 col = mix(ice, ember, heat);
  float glow = 1.0;
  float scan = smoothstep(0.06, 0.0, abs(p.y - uScanY)) * uScanOn;
  float wave = exp(-pow((aT3.x - uWaveX) / 0.09, 2.0)) * uWaveOn * l3 * (1.0 - l4);
  col = mix(col, vec3(1.0), (scan + wave) * 0.7);
  glow += (scan + wave) * 1.6;
  if (uHover > -0.5) { glow *= hot ? 1.9 * e5 + (1.0 - e5) : mix(1.0, 0.45, e5); if (hot) col = mix(col, vec3(0.85, 1.0, 1.0), 0.35 * e5); }

  vColor = col;
  vAlpha = since < 0.0 ? 0.0 : glow * (0.55 + heat * 0.25);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha *= clamp(1.0 - (-mv.z - uFocus) * 0.55, 0.3, 1.3);
  float size = uSize * (0.7 + aMisc.w * 0.6) * (1.0 + heat * 0.7) * (hot ? 1.0 + 0.4 * e5 : 1.0);
  gl_PointSize = since < 0.0 ? 0.0 : clamp(size * uPxPerUnit / -mv.z, 0.0, 24.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  vec3 c = vColor * a * vAlpha;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

const LINE_VERT = /* glsl */ `
uniform float uTurn, uScale;
varying float vX;
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
void main() {
  vX = position.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(rotY(position * uScale, uTurn), 1.0);
}`;
const LINE_FRAG = /* glsl */ `
uniform float uOpacity, uWaveX;
varying float vX;
void main() {
  float wave = exp(-pow((vX - uWaveX) / 0.12, 2.0));
  vec3 c = vec3(0.30, 0.95, 1.0) * (0.22 + wave * 0.9) * uOpacity;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

export interface Shapes {
  ball: Float32Array;      // unit sphere (+ seam)
  knight: Float32Array;
  calibration: Float32Array;
  network: Float32Array;
  networkNodes: THREE.Vector3[];
  networkEdges: [number, number][];
  gyroid: Float32Array;
}

export interface CloudHandle {
  points: THREE.Points;
  lines: THREE.LineSegments;
  uniforms: Record<string, THREE.IUniform>;
  /**
   * Place the five constellation pieces: slot centres (world) and a radius
   * (world). With `only`, every point draws that one piece (the stills script).
   */
  layout(slots: THREE.Vector3[], radius: number, only?: number): void;
  dispose(): void;
}

export const PIECES = 5;
/** The calibration object is "printed" in this many layers (the sound ticks once per layer). */
export const PRINT_LAYERS = 14;
const CAL_TILT = 0.6;

export function createCloud(n: number, s: Shapes, timing: Timing): CloudHandle {
  const rand = rng(31);
  const pos = new Float32Array(n * 3);
  const t5 = new Float32Array(n * 3);
  const delay = new Float32Array(n * 4);
  const misc = new Float32Array(n * 4);

  // Height range of the calibration object, for printing it in layers.
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < s.calibration.length; i += 3) { minY = Math.min(minY, s.calibration[i]); maxY = Math.max(maxY, s.calibration[i]); }

  // Each piece of the constellation is a miniature of one of the shapes (the
  // calibration object tipped the same way as on stage).
  const calTilted = new Float32Array(s.calibration.length);
  const c = Math.cos(CAL_TILT), sn = Math.sin(CAL_TILT);
  for (let i = 0; i < s.calibration.length; i += 3) {
    const y = s.calibration[i + 1], z = s.calibration[i + 2];
    calTilted[i] = s.calibration[i]; calTilted[i + 1] = c * y - sn * z; calTilted[i + 2] = sn * y + c * z;
  }
  const minis = [s.ball, s.knight, calTilted, s.network, s.gyroid];

  for (let i = 0; i < n; i++) {
    const x = s.ball[3 * i], y = s.ball[3 * i + 1], z = s.ball[3 * i + 2];
    pos.set([x * BALL_RADIUS, y * BALL_RADIUS, z * BALL_RADIUS], 3 * i);
    const cy = s.calibration[3 * i + 1];
    const layer = Math.floor(((cy - minY) / (maxY - minY || 1)) * PRINT_LAYERS) / PRINT_LAYERS;
    const r4 = Math.hypot(s.gyroid[3 * i], s.gyroid[3 * i + 1], s.gyroid[3 * i + 2]);
    delay.set([layer, rand(), r4, rand()], 4 * i);
    misc.set([burnThreshold(x, y, z), rand(), i % PIECES, rand()], 4 * i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT1', new THREE.BufferAttribute(s.knight.subarray(0, n * 3), 3));
  geo.setAttribute('aT2', new THREE.BufferAttribute(s.calibration.subarray(0, n * 3), 3));
  geo.setAttribute('aT3', new THREE.BufferAttribute(s.network.subarray(0, n * 3), 3));
  geo.setAttribute('aT4', new THREE.BufferAttribute(s.gyroid.subarray(0, n * 3), 3));
  const t5Attr = new THREE.BufferAttribute(t5, 3);
  t5Attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aT5', t5Attr);
  geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 4));
  geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 4));

  const uniforms: Record<string, THREE.IUniform> = {
    uT: { value: 0 },
    uIgnite: { value: timing.ignite },
    uBurnDur: { value: timing.burnDur },
    uSpin: { value: timing.spin },
    uEmber: { value: timing.ember },
    uFly1: { value: timing.fly1 },
    uStart: { value: new THREE.Vector4(...timing.start) },
    uSpread: { value: new THREE.Vector4(...timing.spread) },
    uDur: { value: new THREE.Vector4(...timing.dur) },
    uTurn: { value: 0 },
    uScale: { value: 0.95 },
    uCalTilt: { value: CAL_TILT },
    uBurst: { value: 0.9 },
    uScanY: { value: -9 }, uScanOn: { value: 0 },
    uWaveX: { value: -9 }, uWaveOn: { value: 0 },
    uHover: { value: -1 }, uHoverSpin: { value: 0 },
    uSlots: { value: Array.from({ length: PIECES }, () => new THREE.Vector3()) },
    uPxPerUnit: { value: 800 },
    uSize: { value: 0.011 },
    uFocus: { value: 5 },
  };
  const mat = glowBlending(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // The network's connections, drawn as lines while it's on stage.
  const lp: number[] = [];
  for (const [a, b] of s.networkEdges) {
    const A = s.networkNodes[a], B = s.networkNodes[b];
    lp.push(A.x, A.y, A.z, B.x, B.y, B.z);
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lineUniforms = { uTurn: uniforms.uTurn, uScale: uniforms.uScale, uOpacity: { value: 0 }, uWaveX: uniforms.uWaveX };
  const lmat = glowBlending(new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: lineUniforms }));
  const lines = new THREE.LineSegments(lgeo, lmat);
  lines.frustumCulled = false;
  uniforms.uLineOpacity = lineUniforms.uOpacity;

  return {
    points,
    lines,
    uniforms,
    layout(slots, radius, only) {
      slots.forEach((v, k) => (uniforms.uSlots.value as THREE.Vector3[])[k].copy(v));
      for (let i = 0; i < n; i++) {
        const k = only ?? i % PIECES, src = minis[k], c = slots[k];
        t5[3 * i] = c.x + src[3 * i] * radius;
        t5[3 * i + 1] = c.y + src[3 * i + 1] * radius;
        t5[3 * i + 2] = c.z + src[3 * i + 2] * radius;
      }
      t5Attr.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); lgeo.dispose(); lmat.dispose(); },
  };
}
