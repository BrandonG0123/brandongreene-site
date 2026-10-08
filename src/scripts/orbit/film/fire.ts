/**
 * Fire for the opening film: a raymarched volume, not sprites.
 *
 * For each pixel a ray is marched through a bounding sphere round the plume.
 * At each step the sample is traced back along the wind to the ball's surface
 * (with the plume bending upward and spreading as it goes); if that spot is
 * burning, flame tongues come from advected noise there, hottest near the
 * surface, breaking up with distance, with smoke beyond. The ray stops at the
 * ball, so flame behind it is hidden.
 *
 * The burn lives on the ball's own surface (it turns with the ball), so the
 * trace back is turned into the ball's frame before asking whether it burns.
 * Anything below the scan line no longer exists and no longer burns.
 */
import * as THREE from 'three';
import { rng } from '../util';
import { BURN_GLSL } from './felt';

const NS = 128, PERIOD = 8;
/** Tileable gradient noise baked into a 3D texture, so the march costs one fetch per octave. */
function noiseTexture() {
  const rand = rng(99);
  const grads: number[][] = [];
  for (let i = 0; i < PERIOD ** 3; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    grads.push([s * Math.cos(th), u, s * Math.sin(th)]);
  }
  const G = (x: number, y: number, z: number) => grads[((x % PERIOD) * PERIOD + (y % PERIOD)) * PERIOD + (z % PERIOD)];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const data = new Uint8Array(NS ** 3);
  for (let z = 0; z < NS; z++) for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const px = (x / NS) * PERIOD, py = (y / NS) * PERIOD, pz = (z / NS) * PERIOD;
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    let v = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const g = G(ix + dx, iy + dy, iz + dz);
      const dot = g[0] * (fx - dx) + g[1] * (fy - dy) + g[2] * (fz - dz);
      v += dot * (dx ? fade(fx) : 1 - fade(fx)) * (dy ? fade(fy) : 1 - fade(fy)) * (dz ? fade(fz) : 1 - fade(fz));
    }
    data[(z * NS + y) * NS + x] = Math.max(0, Math.min(255, Math.round((v * 0.9 + 0.5) * 255)));
  }
  const t = new THREE.Data3DTexture(data, NS, NS, NS);
  t.format = THREE.RedFormat;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCam, uCenter, uWind, uIgn;
uniform mat3 uToLocal;
uniform float uR, uBurn, uScanY, uTime, uLevel;
in vec2 vUv;
out vec4 outColor;
${BURN_GLSL}
float n3(vec3 p) { return texture(uNoise, p / ${PERIOD.toFixed(1)}).r * 2.0 - 1.0; }
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; }
  return s;
}
void sampleFire(vec3 pw, out vec3 em, out float ext) {
  em = vec3(0.0); ext = 0.0;
  vec3 p = pw - uCenter;
  float along = max(dot(p, uWind), 0.0);
  // The plume bends up and spreads as it goes.
  vec3 q = p - vec3(0.0, 0.16 * along * along, 0.0);
  vec3 perp = q - uWind * dot(q, uWind);
  q = uWind * dot(q, uWind) + perp / (1.0 + along * 0.5);
  q += 0.1 * vec3(n3(pw * 2.3 + 11.0), n3(pw * 2.3 + 23.0), n3(pw * 2.3 + 37.0)) * (0.3 + along);
  float pq = dot(q, uWind);
  float disc = pq * pq - dot(q, q) + uR * uR;
  if (disc < 0.0) return;
  float t = pq - sqrt(disc);           // how far this bit of flame has travelled
  if (t < 0.0) return;
  vec3 sw = q - uWind * t;             // where on the ball it left from (relative to the centre)
  if (sw.y + uCenter.y < uScanY) return;  // scanned away: nothing there to burn
  vec3 n = normalize(uToLocal * sw);
  float bt = burnT(n, uIgn);
  float front = exp(-pow((bt - uBurn) / 0.07, 2.0));
  float src = max(front, step(bt, uBurn) * 0.4) * uLevel;
  if (src < 0.02) return;
  vec3 flow = pw * 4.2 - uWind * (t * 4.5 + uTime * 2.6);
  flow += 0.35 * vec3(n3(flow * 0.7 + 5.0), n3(flow * 0.7 + 9.0), n3(flow * 0.7 + 13.0));
  float tongues = fbm(flow) * 0.5 + 0.5;
  float th = 0.47 + t * 0.3;
  // Flames lift off just above the felt; the ember line on the felt itself is the felt's.
  float d = smoothstep(th, th + 0.07, tongues) * src * exp(-t * 1.5) * smoothstep(0.0, 0.06, t);
  float temp = clamp(d * 1.1 + (0.85 - t * 1.3) * 0.5, 0.0, 1.0);
  temp = temp * (0.75 + 0.25 * smoothstep(0.0, 0.08, t));
  em = blackbody(temp) * d * 9.0;
  ext = d * 9.0;
  float sm = smoothstep(0.25, 0.9, t) * smoothstep(0.5, 0.72, fbm(flow * 0.55 + 7.0) * 0.5 + 0.5) * src * exp(-t * 0.7);
  ext += sm * 4.0;
  em += vec3(0.5, 0.2, 0.07) * sm * 0.5 * exp(-t * 1.8);
}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  if (uLevel <= 0.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  vec3 ro = uCam;
  vec3 c = uCenter + uWind * 1.0 + vec3(0.0, 0.25, 0.0);
  float rad = 2.7;
  vec3 oc = ro - c;
  float b = dot(oc, rd), cc = dot(oc, oc) - rad * rad, h = b * b - cc;
  if (h < 0.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t0 = max(-b - sqrt(h), 0.0), t1 = -b + sqrt(h);
  // Stop at the ball (what's left of it above the scan line).
  vec3 ob = ro - uCenter;
  float bb = dot(ob, rd), bc = dot(ob, ob) - uR * uR * 1.07, bh = bb * bb - bc;
  if (bh > 0.0) {
    float hit = -bb - sqrt(bh);
    if ((ro + rd * hit).y > uScanY) t1 = min(t1, hit);
  }
  const int STEPS = 150;
  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * h12(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 em; float ext;
    sampleFire(ro + rd * t, em, ext);
    col += T * em * dt;
    T *= exp(-ext * dt);
    if (T < 0.01) break;
    t += dt;
  }
  outColor = vec4(col, T);
}`;

export interface Fire {
  /** Draw the volume for this camera into its target; then composite with the pass below. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
  target: THREE.WebGLRenderTarget;
  uniforms: Record<string, THREE.IUniform>;
  /** A pass for EffectComposer: scene × transmittance + fire. */
  compositeShader: THREE.ShaderMaterialParameters;
  dispose(): void;
}

export function createFire(w: number, h: number): Fire {
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const uniforms = {
    uNoise: { value: noiseTexture() },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCam: { value: new THREE.Vector3() },
    uCenter: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector3(0, 1, 0) },
    uIgn: { value: new THREE.Vector3(0, -1, 0) },
    uToLocal: { value: new THREE.Matrix3() },
    uR: { value: 0.62 },
    uBurn: { value: 0 },
    uScanY: { value: -9 },
    uTime: { value: 0 },
    uLevel: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: FRAG,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    target,
    uniforms,
    render(renderer, camera) {
      uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      uniforms.uCamWorld.value.copy(camera.matrixWorld);
      uniforms.uCam.value.copy(camera.position);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, ortho);
      renderer.setRenderTarget(prev);
    },
    compositeShader: {
      uniforms: { tDiffuse: { value: null }, tFire: { value: target.texture } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tFire; varying vec2 vUv;
        void main() { vec4 s = texture2D(tDiffuse, vUv); vec4 f = texture2D(tFire, vUv); gl_FragColor = vec4(s.rgb * f.a + f.rgb, 1.0); }`,
    },
    dispose() { target.dispose(); mat.dispose(); quad.geometry.dispose(); (uniforms.uNoise.value as THREE.Texture).dispose(); },
  };
}
