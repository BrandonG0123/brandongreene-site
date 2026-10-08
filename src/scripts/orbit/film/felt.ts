/**
 * The photoreal ball for the opening film: a physical felt base with the seam
 * drawn into it, and fuzz shells over it that part at the seam, so the
 * silhouette goes soft and catches the rim light.
 *
 * Two things eat it. The burn spreads from an ignition point on the ball's own
 * surface (it turns with the ball): char runs ahead of the flame, embers
 * glow in it, the edge glows, and burnt felt is gone, showing the rubber
 * core under it, still hot just behind the edge. The scan
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
uniform float uBurn, uScanY, uTime;
const float SEAM_W = 0.036;
float seamDist(vec3 n) {
  vec2 uv = vec2(atan(n.x, n.z) / 6.2831853 + 0.5, 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.14159265);
  return texture2D(uSeam, uv).r * 0.12;
}
float h31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
${BURN_GLSL}`;

export interface FeltBall {
  group: THREE.Group;
  uniforms: { uIgn: { value: THREE.Vector3 }; uBurn: { value: number }; uScanY: { value: number }; uTime: { value: number } };
  dispose(): void;
}

export function feltBall(radius: number, shells = 32): FeltBall {
  const uniforms = {
    uSeam: { value: seamTexture() },
    uIgn: { value: new THREE.Vector3(0, -1, 0) },
    uBurn: { value: -0.1 },
    uScanY: { value: -9 },
    uTime: { value: 0 },
  };
  const mats: THREE.Material[] = [];
  const mat = (shell: number) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d2f01a'), roughness: 0.95, sheen: 0.6, sheenRoughness: 0.55,
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
          // The fuzz singes off just ahead of the felt, baring the char and the ember line.
          float burn = burnT(n, uIgn) - uBurn - step(0.001, uShell) * (0.035 + uShell * 0.03);
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
          // Felt isn't one flat colour: a faint mottle, worn a little paler in places.
          float mottle = sin(n.x * 9.0 + sin(n.y * 7.0)) * sin(n.y * 8.0 + 1.3) * sin(n.z * 10.0 + 2.1);
          diffuseColor.rgb *= 0.95 + 0.07 * mottle;
          // Char runs ahead of the flame; singed fuzz goes brown first.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.1, 0.03), 1.0 - smoothstep(0.035, 0.075, burn));
          diffuseColor.rgb *= mix(0.015, 1.0, smoothstep(0.004, 0.05, burn));
          if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.03, 0.025, 0.02);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float lit = step(0.0, uBurn);
            // The ember line: thin, hot, broken up along its length (only on the felt
            // itself, so the fuzz shells over it don't stack it into a tube).
            float edge = 1.0 - smoothstep(0.0, 0.02, burn);
            float breakup = 0.35 + 0.65 * smoothstep(0.35, 0.75, h31(floor(n * 140.0)) * 0.6 + 0.4 * (0.5 + 0.5 * sin(uTime * 9.0 + n.x * 60.0 + n.y * 47.0)));
            totalEmissiveRadiance += blackbody(0.3 + 0.5 * edge) * edge * edge * breakup * 2.6 * lit * (1.0 - step(0.001, uShell));
            // Burning fuzz tips just ahead of it.
            totalEmissiveRadiance += vec3(1.0, 0.3, 0.04) * (1.0 - smoothstep(0.0, 0.008, burn)) * 0.5 * lit * step(0.001, uShell);
            // Embers in the char: sparse, flickering.
            vec3 cell = floor(n * 320.0);
            float speck = step(0.975, h31(cell + 7.0));
            float flick = 0.4 + 0.6 * sin(uTime * (14.0 + 20.0 * h31(cell)) + h31(cell + 3.0) * 30.0);
            totalEmissiveRadiance += blackbody(0.45) * speck * flick * (1.0 - smoothstep(0.0, 0.06, burn)) * 2.2 * lit * (1.0 - step(0.001, uShell));
          }
          // The scan's cut: a thin line of ice light where the felt ends.
          float cut = 1.0 - smoothstep(0.0, 0.05, scan);
          totalEmissiveRadiance += vec3(0.3, 0.95, 1.0) * cut * cut * 2.4;`);
    };
    m.customProgramCacheKey = () => (shell ? 'film-felt-shell' : 'film-felt-base');
    mats.push(m);
    return m;
  };
  // The rubber core under the felt: it shows where the felt has burnt away,
  // glowing just behind the edge and cooling to char further back.
  const core = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1917'), roughness: 0.8 });
  core.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDir;\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDir;\nvarying vec3 vW;\n${FELT_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 n = normalize(vDir);
        float scan = (vW.y - uScanY) * 1.8;
        if (scan < 0.0) discard;
        float burn = burnT(n, uIgn) - uBurn;
        // Blistered: darker in patches.
        diffuseColor.rgb *= 0.7 + 0.3 * sin(n.x * 23.0 + sin(n.y * 19.0) * 2.0) * sin(n.z * 21.0 + n.y * 9.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float heat = exp(min(burn, 0.0) / 0.022) * step(0.0, uBurn) * step(burn, 0.0);
        float glow = heat * (0.6 + 0.4 * sin(uTime * 11.0 + n.x * 30.0 + n.z * 25.0));
        totalEmissiveRadiance += blackbody(0.2 + 0.4 * heat) * glow * 1.4;
        // The scan cuts the core too, where the felt has already burnt away.
        float cut = 1.0 - smoothstep(0.0, 0.05, scan);
        totalEmissiveRadiance += vec3(0.3, 0.95, 1.0) * cut * cut * 6.0;`);
  };
  core.customProgramCacheKey = () => 'film-felt-core';
  mats.push(core);

  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(radius, 192, 128);
  const coreMesh = new THREE.Mesh(sphere, core);
  coreMesh.scale.setScalar(0.975);
  group.add(coreMesh);
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
