/**
 * Flames. Each sprite is born where the burn front crosses its spot on the
 * ball (the same burnThreshold the felt uses), then rises, drifts, swells and
 * cools: white, yellow, orange, deep red, gone. Entirely in the vertex shader
 * from time alone; the CPU only sets uT.
 */
import * as THREE from 'three';
import { BURN_GLSL, burnThreshold, glowBlending, rng } from './shapes';
import { BALL_RADIUS } from './ball';

const VERT = /* glsl */ `
uniform float uT;          // seconds since the intro began
uniform float uIgnite;     // when the burn starts
uniform float uBurnDur;    // how long the front takes to cross the ball
uniform float uSpin;       // ball spin, radians per second
uniform float uPxPerUnit;  // pixels per world unit at distance 1
attribute vec4 aSeed;
varying float vAge;
varying float vSeed;
${BURN_GLSL}
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
void main() {
  vec3 dir = normalize(position);
  float born = uIgnite + burnThreshold(dir) * uBurnDur + aSeed.x * 0.18;
  float life = 0.45 + aSeed.y * 0.55;
  float age = (uT - born) / life;
  vAge = age;
  vSeed = aSeed.z;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  // Where the spot was when it caught, on the turning ball; then up and out.
  vec3 p = rotY(dir * ${BALL_RADIUS.toFixed(3)} * 1.01, uSpin * born);
  float rise = pow(age, 1.25) * (0.28 + aSeed.z * 0.42);
  p += dir * age * 0.06;
  p.y += rise;
  p.x += sin(age * 7.0 + aSeed.w * 20.0) * 0.035 * age;
  p.z += cos(age * 6.0 + aSeed.x * 17.0) * 0.035 * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.1 + aSeed.w * 0.16) * sin(3.14159 * min(1.0, age * 1.25 + 0.12));
  gl_PointSize = clamp(size * uPxPerUnit / -mv.z, 0.0, 96.0);
}`;

const FRAG = /* glsl */ `
varying float vAge;
varying float vSeed;
void main() {
  // A soft teardrop: wider low, licking up to a point.
  vec2 uv = gl_PointCoord - 0.5;
  uv.y = -uv.y;
  uv.x *= 1.0 + max(0.0, uv.y) * 1.8;
  float d = length(uv * vec2(1.0, 0.8));
  float a = smoothstep(0.5, 0.0, d);
  float t = 1.0 - vAge;  // temperature
  vec3 col = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.42, 0.06), smoothstep(0.0, 0.45, t));
  col = mix(col, vec3(1.0, 0.7, 0.25), smoothstep(0.5, 0.85, t));
  col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.92, 1.0, t));
  float flicker = 0.8 + 0.2 * sin(vSeed * 40.0 + vAge * 30.0);
  // Dim per sprite: hundreds overlap at the front, and they should add up to
  // orange flame, not a white blob.
  vec3 c = col * a * pow(t, 0.8) * flicker * 0.24;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

export interface Fire {
  points: THREE.Points;
  uniforms: Record<string, { value: number }>;
  /** 0–1: how much is burning at time t, for the heat light. */
  activity(t: number): number;
  dispose(): void;
}

export function createFire(count: number, timing: { ignite: number; burnDur: number; spin: number }): Fire {
  const rand = rng(21);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  const born: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const x = s * Math.cos(th), y = u, z = s * Math.sin(th);
    pos.set([x, y, z], 3 * i);
    seed.set([rand(), rand(), rand(), rand()], 4 * i);
    born.push(timing.ignite + burnThreshold(x, y, z) * timing.burnDur);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));

  const uniforms = {
    uT: { value: 0 },
    uIgnite: { value: timing.ignite },
    uBurnDur: { value: timing.burnDur },
    uSpin: { value: timing.spin },
    uPxPerUnit: { value: 800 },
  };
  const mat = glowBlending(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Precomputed burn profile, so the heat light can follow the fire.
  born.sort((a, b) => a - b);
  const activity = (t: number) => {
    let lo = 0, hi = born.length;
    const from = t - 0.7;
    while (lo < hi) { const m = (lo + hi) >> 1; born[m] < from ? (lo = m + 1) : (hi = m); }
    let n = 0;
    for (let i = lo; i < born.length && born[i] <= t; i++) n++;
    return Math.min(1, n / (count * 0.32));
  };

  return { points, uniforms, activity, dispose() { geo.dispose(); mat.dispose(); } };
}
