/**
 * The photoreal ball for the opening film: a physical felt base with the seam
 * drawn into it, and fuzz shells over it that part at the seam, so the
 * silhouette goes soft and catches the rim light.
 *
 * Two things eat it. The burn spreads from an ignition point on the ball's own
 * surface (it turns with the ball): char runs ahead of the flame, the edge
 * glows, and burnt felt is gone, showing the dark rubber inside. The scan
 * climbs in world space: below the line the felt is gone (the live scene
 * draws it as points there), and the cut glows ice.
 *
 * Only the film uses this (video/), never the page: the page shows the
 * rendered video instead.
 */
import * as THREE from 'three';
import { seamPoint } from '../util';

let seamCache: THREE.DataTexture | null = null;
/** Angular distance to the seam over the sphere, as an equirect map (0…0.12 rad). */
function seamTexture() {
  if (seamCache) return seamCache;
  const SW = 1024, SH = 512;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 1400; i++) pts.push(seamPoint((i / 1400) * Math.PI * 2).normalize());
  const data = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++) {
    const lat = (0.5 - (y + 0.5) / SH) * Math.PI;
    for (let x = 0; x < SW; x++) {
      const lon = ((x + 0.5) / SW) * Math.PI * 2 - Math.PI;
      const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
      let best = -1;
      for (const p of pts) { const c = p.x * dx + p.y * dy + p.z * dz; if (c > best) best = c; }
      data[y * SW + x] = Math.min(255, Math.round((Math.acos(Math.min(1, best)) / 0.12) * 255));
    }
  }
  const t = new THREE.DataTexture(data, SW, SH, THREE.RedFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return (seamCache = t);
}

/** Where the burn has reached on the ball's surface: GLSL shared with the fire. */
export const BURN_GLSL = /* glsl */ `
float burnT(vec3 n, vec3 ign) {
  float a = acos(clamp(dot(n, ign), -1.0, 1.0)) / 3.14159265;
  float w = sin(7.1 * n.x + 3.3 * n.y) * sin(5.3 * n.y - 2.1 * n.z) * sin(6.7 * n.z + 1.7 * n.x);
  float w2 = sin(17.0 * n.x - 9.0 * n.z) * sin(13.0 * n.y + 11.0 * n.x) * 0.5;
  return clamp(a * 0.9 + 0.05 + w * 0.08 + w2 * 0.03, 0.0, 1.0);
}
vec3 blackbody(float t) {
  vec3 c = mix(vec3(0.3, 0.015, 0.0), vec3(1.0, 0.2, 0.01), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.48, 0.05), smoothstep(0.35, 0.65, t));
  c = mix(c, vec3(1.0, 0.78, 0.25), smoothstep(0.65, 0.88, t));
  return mix(c, vec3(1.0, 0.95, 0.7), smoothstep(0.9, 1.0, t));
}`;

const FELT_GLSL = /* glsl */ `
uniform sampler2D uSeam;
uniform vec3 uIgn;
uniform float uBurn, uScanY;
const float SEAM_W = 0.036;
float seamDist(vec3 n) {
  vec2 uv = vec2(atan(n.x, n.z) / 6.2831853 + 0.5, 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.14159265);
  return texture2D(uSeam, uv).r * 0.12;
}
float h31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
${BURN_GLSL}`;

export interface FeltBall {
  group: THREE.Group;
  uniforms: { uIgn: { value: THREE.Vector3 }; uBurn: { value: number }; uScanY: { value: number } };
  dispose(): void;
}

export function feltBall(radius: number, shells = 32): FeltBall {
  const uniforms = {
    uSeam: { value: seamTexture() },
    uIgn: { value: new THREE.Vector3(0, -1, 0) },
    uBurn: { value: -0.1 },
    uScanY: { value: -9 },
  };
  const mats: THREE.Material[] = [];
  const mat = (shell: number) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d2f01a'), roughness: 0.95, sheen: 1, sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#f4ffb8'), side: shell ? THREE.FrontSide : THREE.DoubleSide,
    });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms, { uShell: { value: shell } });
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDir;\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vDir;\nvarying vec3 vW;\nuniform float uShell;\n${FELT_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 n = normalize(vDir);
          float burn = burnT(n, uIgn) - uBurn - uShell * 0.02;   // fuzz goes a moment before the felt
          float scan = (vW.y - uScanY) * 1.8;
          if (burn < 0.0 || scan < 0.0) discard;
          float sd = seamDist(n);
          if (uShell > 0.0) {
            vec3 q = n * 520.0 + vec3(sin(n.y * 40.0), cos(n.z * 37.0), sin(n.x * 43.0)) * uShell * 2.2;
            if (h31(floor(q)) < 0.30 + uShell * 0.62 || sd < SEAM_W + 0.006 + uShell * 0.014) discard;
            diffuseColor.rgb *= mix(0.55, 1.12, uShell);
          } else {
            float rubber = 1.0 - smoothstep(SEAM_W - 0.003, SEAM_W + 0.002, sd);
            diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.6, 1.0, smoothstep(SEAM_W, SEAM_W + 0.02, sd)), vec3(0.93, 0.92, 0.88), rubber);
          }
          // Char runs ahead of the flame.
          diffuseColor.rgb *= mix(0.03, 1.0, smoothstep(0.0, 0.13, burn));
          if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.03, 0.025, 0.02);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // A thin ember line at the edge, with char spreading ahead of it.
          float hot = 1.0 - smoothstep(0.0, 0.032, burn);
          totalEmissiveRadiance += blackbody(hot * 0.42) * hot * hot * hot * 1.1 * step(0.0, uBurn);
          // The scan's cut: a thin line of ice light where the felt ends.
          float cut = 1.0 - smoothstep(0.0, 0.05, scan);
          totalEmissiveRadiance += vec3(0.3, 0.95, 1.0) * cut * cut * 2.4;`);
    };
    m.customProgramCacheKey = () => (shell ? 'film-felt-shell' : 'film-felt-base');
    mats.push(m);
    return m;
  };
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(radius, 192, 128);
  group.add(new THREE.Mesh(sphere, mat(0)));
  for (let i = 1; i <= shells; i++) {
    const m = new THREE.Mesh(sphere, mat(i / shells));
    m.scale.setScalar(1 + (i / shells) * 0.035);
    group.add(m);
  }
  return {
    group,
    uniforms,
    dispose() { sphere.dispose(); mats.forEach((m) => m.dispose()); },
  };
}
