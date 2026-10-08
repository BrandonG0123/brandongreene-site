/**
 * The centre: self-improvement. Everything comes back to it.
 *
 * As the pieces print, a dashed orbit is drawn from each to the next, so the
 * ring itself gets made. Then a thread of light leaves each piece and winds
 * into the middle, landing on a step of a spiral staircase that lights as they
 * arrive. Once the ring has settled, the staircase is the one thing that keeps
 * moving: a slow turn, so the page never looks frozen.
 */
import * as THREE from 'three';
import { helix } from './emblems';

/**
 * Light that only adds: colour adds and opacity grows only with it. Plain
 * additive blending writes full opacity, which on a transparent canvas paints
 * faint dark marks over the page behind.
 */
function glow<T extends THREE.Material>(m: T): T {
  m.blending = THREE.CustomBlending;
  m.blendSrc = m.blendDst = m.blendSrcAlpha = m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

const THREAD_VERT = /* glsl */ `
varying float vU;
void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const THREAD_FRAG = /* glsl */ `
uniform float uHead, uFade;
varying float vU;
void main() {
  if (vU > uHead) discard;
  // A comet: a white-hot head, an ice tail that thins out behind it.
  float tail = smoothstep(uHead - 0.4, uHead, vU);
  float head = exp(-pow((uHead - vU) / 0.025, 2.0));
  float a = (tail * 0.9 + head * 3.0) * (1.0 - uFade);
  vec3 c = mix(vec3(0.30, 0.95, 1.0), vec3(1.0), head * 0.7) * a;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

const ORBIT_VERT = /* glsl */ `
attribute float aU;
varying float vU;
varying vec3 vW;
void main() { vU = aU; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ORBIT_FRAG = /* glsl */ `
uniform float uDraw, uOpacity;
uniform vec3 uSlots[6];
uniform float uGap;
varying float vU;
varying vec3 vW;
void main() {
  if (vU > uDraw) discard;
  // Dashed, like a toolpath preview; it parts round each piece and its label.
  if (fract(vU * 140.0) > 0.55) discard;
  float gap = 1.0;
  for (int i = 0; i < 6; i++) {
    vec2 d = (vW.xy - uSlots[i].xy) * vec2(1.0, 0.8) - vec2(0.0, -uGap * 0.45);
    gap = min(gap, smoothstep(uGap * 1.25, uGap * 1.9, length(d)));
  }
  float head = exp(-pow((uDraw - vU) / 0.012, 2.0)) * step(uDraw, 0.999);
  vec3 c = vec3(0.30, 0.95, 1.0) * (uOpacity * gap + head * 1.6);
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`;

export interface Centre {
  group: THREE.Group;
  /** Lay out: the centre and its scale, where the six pieces are, their size, and the orbit's radii. */
  place(centre: THREE.Vector3, scale: number, from: THREE.Vector3[], pieceSize: number, orbit: { rx: number; ry: number; start: number }): void;
  /**
   * The orbit drawn so far (0 → 1), each thread's head (0 → 1 along it; past
   * 1 it has landed and fades), steps lit (0 → count), and the staircase's turn.
   */
  set(draw: number, heads: number[], lit: number, turn: number): void;
  /** Where the staircase's foot is (world), for the label. */
  foot(): THREE.Vector3;
  /** How many steps it has. */
  count: number;
  dispose(): void;
}

const TILT = 0.42; // the staircase leans toward you, so the treads read as a spiral

export function createCentre(): Centre {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  const stair = new THREE.Group();
  tilt.rotation.x = TILT;
  tilt.add(stair);
  group.add(tilt);
  const h = helix();

  const stepUniforms = { uLit: { value: 0 }, uCount: { value: h.count } };
  // Solid light: drawn opaque, so treads in front cleanly hide those behind.
  // Each glows brighter the higher it is, so the staircase reads as rising.
  const stepMat = new THREE.ShaderMaterial({
    uniforms: stepUniforms,
    vertexShader: `attribute float aStep; varying float vStep; varying vec3 vN; varying vec3 vV;
      void main() {
        vStep = aStep;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uLit, uCount; varying float vStep; varying vec3 vN; varying vec3 vV;
      void main() {
        float on = clamp(uLit - vStep, 0.0, 1.0);
        float since = uLit - vStep;
        float flash = since > 0.0 ? exp(-since * 0.9) : 0.0;
        float rise = vStep / (uCount - 1.0);
        // Tops catch the light, the treads' edges fall darker, and grazing angles glow:
        // that's what makes them read as solid steps.
        float top = smoothstep(0.2, 0.9, vN.y);
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 deep = vec3(0.03, 0.26, 0.32), bright = vec3(0.6, 1.0, 1.0);
        vec3 base = mix(deep, bright, 0.3 + 0.7 * rise);
        vec3 lit = base * (0.42 + 0.58 * top) + vec3(0.30, 0.95, 1.0) * rim * 0.5;
        lit = mix(lit, vec3(1.0), flash * 0.6);
        // Unlit, it's a faint glass outline, waiting.
        vec3 off = vec3(0.30, 0.95, 1.0) * (0.035 + rim * 0.22);
        gl_FragColor = vec4(mix(off, lit, on), 1.0);
      }`,
  });
  const steps = new THREE.Mesh(h.steps, stepMat);
  // The column and the handrail fill upward with the steps, as light.
  const fill = (lo: number, hi: number, base: number) => glow(new THREE.ShaderMaterial({
    uniforms: stepUniforms,
    vertexShader: `varying float vY; varying vec2 vUv; void main() { vY = position.y; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uLit, uCount; varying float vY; varying vec2 vUv;
      void main() {
        float k = ${lo < 0 ? 'vUv.x' : `(vY - ${lo.toFixed(3)}) / ${(hi - lo).toFixed(3)}`};
        float f = uLit / uCount;
        float on = step(k, f);
        float head = exp(-pow((f - k) / 0.03, 2.0)) * step(0.001, f) * step(f, 0.999);
        vec3 c = vec3(0.30, 0.95, 1.0) * (${base.toFixed(2)} + on * 0.6) + vec3(1.0) * head * 0.8;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
      }`,
  }));
  h.column.computeBoundingBox();
  const cb = h.column.boundingBox!;
  const column = new THREE.Mesh(h.column, fill(cb.min.y, cb.max.y, 0.06));
  const rail = new THREE.Mesh(h.rail, fill(-1, 1, 0.05));
  stair.add(steps, column, rail);

  const threads: { mesh: THREE.Mesh; uniforms: { uHead: { value: number }; uFade: { value: number } } }[] = [];
  const threadGroup = new THREE.Group();
  group.add(threadGroup);

  const orbitUniforms = {
    uDraw: { value: 0 }, uOpacity: { value: 0.26 }, uGap: { value: 0.3 },
    uSlots: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
  };
  const orbitMat = glow(new THREE.ShaderMaterial({ uniforms: orbitUniforms, vertexShader: ORBIT_VERT, fragmentShader: ORBIT_FRAG }));
  orbitMat.depthTest = true;
  let orbit: THREE.Line | null = null;

  let foot = new THREE.Vector3();

  return {
    group,
    place(c, s, from, pieceSize, o) {
      tilt.position.copy(c);
      tilt.scale.setScalar(s);
      tilt.updateMatrixWorld(true);
      // The label goes under the lowest tread's outer edge, clear of the staircase.
      const footLocal = new THREE.Vector3(0, -1.08, 0.3);
      foot = tilt.localToWorld(footLocal);

      for (const t of threads) { t.mesh.geometry.dispose(); threadGroup.remove(t.mesh); }
      threads.length = 0;
      from.forEach((p, k) => {
        // Leave the piece, swing round the centre and land on step k's height,
        // so the six arrivals climb the staircase in order.
        const land = tilt.localToWorld(new THREE.Vector3(0, h.stepY(Math.round(((k + 0.6) / from.length) * (h.count - 1))), 0));
        const pts: THREE.Vector3[] = [];
        const a0 = Math.atan2(p.y - c.y, p.x - c.x);
        const r0 = Math.hypot(p.x - c.x, p.y - c.y) - pieceSize * 1.05;
        for (let i = 0; i <= 32; i++) {
          const u = i / 32;
          const a = a0 + u * 1.25;              // a turn as it falls inward
          const r = r0 * Math.pow(1 - u, 1.15);
          const ring = new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0);
          const pt = ring.lerp(land, Math.pow(u, 2.2));
          pt.z += Math.sin(u * Math.PI) * 0.9 * s;
          pts.push(pt);
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 128, 0.02 * s, 6, false);
        const uniforms = { uHead: { value: 0 }, uFade: { value: 0 } };
        const mesh = new THREE.Mesh(geo, glow(new THREE.ShaderMaterial({ vertexShader: THREAD_VERT, fragmentShader: THREAD_FRAG, uniforms })));
        mesh.frustumCulled = false;
        threadGroup.add(mesh);
        threads.push({ mesh, uniforms });
      });

      // The orbit: an ellipse through the six pieces, drawn clockwise from the first.
      if (orbit) { orbit.geometry.dispose(); group.remove(orbit); }
      const N = 720, pos = new Float32Array((N + 1) * 3), us = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const a = o.start - (i / N) * Math.PI * 2;
        pos.set([c.x + Math.cos(a) * o.rx, c.y + Math.sin(a) * o.ry, 0], 3 * i);
        us[i] = i / N;
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      og.setAttribute('aU', new THREE.BufferAttribute(us, 1));
      orbit = new THREE.Line(og, orbitMat);
      orbit.frustumCulled = false;
      group.add(orbit);
      from.forEach((p, k) => (orbitUniforms.uSlots.value as THREE.Vector3[])[k].copy(p));
      orbitUniforms.uGap.value = pieceSize;
    },
    set(draw, heads, lit, turn) {
      orbitUniforms.uDraw.value = draw;
      if (orbit) orbit.visible = draw > 0;
      heads.forEach((u, k) => {
        const t = threads[k];
        if (!t) return;
        t.uniforms.uHead.value = Math.min(u, 1.0);
        t.uniforms.uFade.value = Math.max(0, Math.min(1, (u - 1) / 0.45));
        t.mesh.visible = u > 0 && u < 1.45;
      });
      stepUniforms.uLit.value = lit;
      stair.rotation.y = turn;
      tilt.visible = lit > 0 || heads.some((u) => u > 0);
    },
    foot() { return foot.clone(); },
    count: h.count,
    dispose() {
      h.steps.dispose(); h.column.dispose(); h.rail.dispose(); stepMat.dispose();
      (column.material as THREE.Material).dispose(); (rail.material as THREE.Material).dispose(); orbitMat.dispose();
      orbit?.geometry.dispose();
      for (const t of threads) { t.mesh.geometry.dispose(); (t.mesh.material as THREE.Material).dispose(); }
    },
  };
}
