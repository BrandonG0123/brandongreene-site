/**
 * The objects on the ring, one per category, each something Brandon told us
 * about himself, plus the helix at the centre. Every geometry is centred, sits
 * inside a unit sphere and stands on its base along +Y, because each one is
 * printed from the bottom up.
 *
 *   tennis    the ball, its seam printed in white (the only optic-yellow piece)
 *   school    a stack of three books
 *   projects  the foot scanner's real calibration object (simplified STL)
 *   coding    </>
 *   hobbies   a mountain ridge: skiing is his favourite thing
 *   mind      a crescent moon
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seamPoint } from '../intro/shapes';

export type Key = 'tennis' | 'school' | 'projects' | 'coding' | 'hobbies' | 'mind';
export const KEYS: Key[] = ['tennis', 'school', 'projects', 'coding', 'hobbies', 'mind'];

/** Centre on the bounding box, scale into a unit sphere, then stand it on y = -1 … */
function fit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  let r = 0;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
  g.scale(1 / r, 1 / r, 1 / r);
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

const plain = (g: THREE.BufferGeometry) => {
  // Merge needs identical attribute sets.
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
};

// ---- tennis: the ball, seam as a printed white groove ----------------------------
export function tennis(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 128, 96);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 720; i++) pts.push(seamPoint((i / 720) * Math.PI * 2).normalize());
  const p = g.attributes.position, d = new THREE.Vector3();
  const seam = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    let best = -1;
    for (const q of pts) { const c = q.x * d.x + q.y * d.y + q.z * d.z; if (c > best) best = c; }
    const ang = Math.acos(Math.min(1, best));
    const s = 1 - THREE.MathUtils.smoothstep(ang, 0.028, 0.05);
    seam[i] = s;
    d.multiplyScalar(1 - 0.018 * s); // the seam sits in a shallow groove
    p.setXYZ(i, d.x, d.y, d.z);
  }
  g.setAttribute('aSeam', new THREE.BufferAttribute(seam, 1));
  g.deleteAttribute('uv');
  return fit(g);
}

// ---- school: three books, the pages set back from the covers ------------------------
export function school(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const books = [
    { w: 1.5, d: 1.05, h: 0.26, y: 0.0, rot: 0.06 },
    { w: 1.38, d: 0.98, h: 0.22, y: 0.27, rot: -0.12 },
    { w: 1.26, d: 0.9, h: 0.3, y: 0.5, rot: 0.2 },
  ];
  for (const b of books) {
    // Two cover boards and a spine, with the page block set back between them,
    // so the covers overhang on the three open sides.
    const pages = new THREE.BoxGeometry(b.w - 0.09, b.h - 0.07, b.d - 0.06);
    pages.translate(0.05, 0, 0);
    const plateT = 0.045;
    const top = new RoundedBoxGeometry(b.w, plateT, b.d, 2, 0.018); top.translate(0, b.h / 2 - plateT / 2, 0);
    const bot = new RoundedBoxGeometry(b.w, plateT, b.d, 2, 0.018); bot.translate(0, -b.h / 2 + plateT / 2, 0);
    const spine = new RoundedBoxGeometry(0.07, b.h, b.d, 2, 0.03); spine.translate(-b.w / 2 + 0.035, 0, 0);
    for (const g of [top, bot, spine, pages]) {
      g.rotateY(b.rot);
      g.translate(0, b.y + b.h / 2, 0);
      parts.push(plain(g));
    }
  }
  return fit(mergeVertices(mergeGeometries(parts), 1e-5));
}

// ---- projects: the calibration object -----------------------------------------------
export async function projects(url: string): Promise<THREE.BufferGeometry> {
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`calibration mesh: ${r.status}`);
    return r.arrayBuffer();
  });
  const head = new DataView(buf);
  const vc = head.getUint32(0, true), ic = head.getUint32(4, true);
  const q = new Int16Array(buf, 8, vc * 3);
  const idx = new Uint16Array(buf.slice(8 + vc * 6, 8 + vc * 6 + ic * 2));
  const pos = new Float32Array(vc * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i] / 32767;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // Flat faces: it's a machined test block, and smooth normals smear its edges.
  return fit(g.toNonIndexed());
}

// ---- coding: </> ---------------------------------------------------------------------
export function coding(): THREE.BufferGeometry {
  const extrude = (s: THREE.Shape) =>
    new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 3, curveSegments: 4 });
  // An angle bracket as a thick stroke: the tip at x = 0, the arms' ends at
  // x = ±w. dir 1 is "<", -1 is ">".
  const bracket = (dir: 1 | -1) => {
    const w = 0.62, h = 0.8, t = 0.24;
    let pts = ([[w, h], [w + t * 0.55, h - t * 0.85], [t * 0.95, 0], [w + t * 0.55, -h + t * 0.85], [w, -h], [0, 0]] as const)
      .map(([x, y]) => new THREE.Vector2(dir * x, y));
    // Shapes must wind counter-clockwise; mirroring one flips it.
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    return new THREE.Shape(pts);
  };
  const lt = extrude(bracket(1)); lt.translate(-1.2, 0, 0);
  const gt = extrude(bracket(-1)); gt.translate(1.2, 0, 0);
  const slash = new THREE.Shape([new THREE.Vector2(-0.36, -0.95), new THREE.Vector2(-0.13, -0.95), new THREE.Vector2(0.36, 0.95), new THREE.Vector2(0.13, 0.95)]);
  const sl = extrude(slash);
  const g = mergeGeometries([plain(lt), plain(gt), plain(sl)]);
  g.translate(0, 0, -0.15);
  return fit(g);
}

// ---- hobbies: a mountain range -------------------------------------------------------------
export function hobbies(): THREE.BufferGeometry {
  // Three low-poly peaks on a slab of rock, the snow printed in white above a
  // ragged snow line (aSeam marks the white, as on the ball).
  const rand = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const parts: THREE.BufferGeometry[] = [];
  const peaks = [
    { x: -0.1, z: 0.05, r: 0.98, h: 1.65, seg: 6, rot: 0.25, snow: 0.6 },
    { x: 0.66, z: 0.25, r: 0.68, h: 1.05, seg: 5, rot: 1.0, snow: 0.66 },
    { x: -0.8, z: -0.2, r: 0.6, h: 0.86, seg: 5, rot: 0.6, snow: 0.7 },
  ];
  peaks.forEach((pk, n) => {
    const c = new THREE.ConeGeometry(pk.r, pk.h, pk.seg, 3);
    const pos = c.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), k = (y + pk.h / 2) / pk.h;
      if (k > 0.02 && k < 0.98) {
        // Knock the middle rings about so the faces break into crags.
        const j = 1 + (rand(n * 50 + Math.round(Math.atan2(pos.getZ(i), pos.getX(i)) * 10) + Math.round(k * 7)) - 0.5) * 0.28;
        pos.setXYZ(i, pos.getX(i) * j, y + (rand(i + n * 9) - 0.5) * 0.06 * pk.h, pos.getZ(i) * j);
      }
    }
    c.rotateY(pk.rot);
    c.translate(pk.x, pk.h / 2 + 0.07, pk.z);
    const g = c.toNonIndexed();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    // Snow by face, so the line follows the facets.
    const p2 = g.attributes.position, snow = new Float32Array(p2.count);
    for (let t = 0; t < p2.count; t += 3) {
      const cy = (p2.getY(t) + p2.getY(t + 1) + p2.getY(t + 2)) / 3;
      const line = 0.07 + pk.h * (pk.snow + (rand(t + n * 31) - 0.5) * 0.12);
      snow[t] = snow[t + 1] = snow[t + 2] = cy > line ? 1 : 0;
    }
    g.setAttribute('aSeam', new THREE.BufferAttribute(snow, 1));
    parts.push(g);
  });
  const slab = new THREE.CylinderGeometry(1.32, 1.4, 0.08, 9).toNonIndexed();
  slab.translate(0, 0.04, 0);
  slab.deleteAttribute('uv');
  slab.deleteAttribute('normal');
  slab.setAttribute('aSeam', new THREE.BufferAttribute(new Float32Array(slab.attributes.position.count), 1));
  parts.push(slab);
  return fit(mergeGeometries(parts));
}

// ---- mind: a crescent moon ----------------------------------------------------------------
export function mind(): THREE.BufferGeometry {
  // A tube swept round most of a circle, swelling in the middle and tapering
  // to two points: a crescent with real thickness, standing on one horn.
  const segs = 160, radial = 28, R = 1, span = Math.PI * 1.42;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = -span / 2 + u * span;
    const c = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0);
    const n = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const b = new THREE.Vector3(0, 0, 1);
    const w = 0.34 * Math.pow(Math.sin(Math.PI * u), 0.85) + 0.004;
    for (let j = 0; j < radial; j++) {
      const t = (j / radial) * Math.PI * 2;
      // Flattened across the face, fuller toward the outside edge.
      const off = n.clone().multiplyScalar(Math.cos(t) * w * (Math.cos(t) > 0 ? 1.0 : 0.7)).add(b.clone().multiplyScalar(Math.sin(t) * w * 0.55));
      pos.push(c.x + off.x, c.y + off.y, c.z + off.z);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b2 = i * radial + ((j + 1) % radial), c2 = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, c2, b2, b2, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Open toward the upper right, the way a crescent is usually drawn.
  g.rotateZ(Math.PI * 0.92);
  return fit(g);
}

// ---- centre: a spiral staircase of light -----------------------------------------------------
export interface Helix { steps: THREE.BufferGeometry; column: THREE.BufferGeometry; count: number; stepY(i: number): number; }
/** Wedge-shaped treads rising round a thin column; each carries its index, so they can light in order. */
export function helix(count = 20): Helix {
  const parts: THREE.BufferGeometry[] = [];
  const r0 = 0.07, r1 = 0.56, width = 0.5;
  const stepY = (i: number) => -0.9 + (i / (count - 1)) * 1.8;
  for (let i = 0; i < count; i++) {
    // An annular sector in the XY plane, extruded and laid flat.
    const s = new THREE.Shape();
    const n = 8;
    for (let j = 0; j <= n; j++) { const a = -width / 2 + (j / n) * width; const pt = [Math.cos(a) * r1, Math.sin(a) * r1]; if (j === 0) s.moveTo(pt[0], pt[1]); else s.lineTo(pt[0], pt[1]); }
    for (let j = n; j >= 0; j--) { const a = -width / 2 + (j / n) * width; s.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    g.rotateY(-i * 0.52);
    g.translate(0, stepY(i), 0);
    const plainG = plain(g);
    plainG.setAttribute('aStep', new THREE.BufferAttribute(new Float32Array(plainG.attributes.position.count).fill(i), 1));
    parts.push(plainG);
  }
  const steps = mergeGeometries(parts);
  const column = new THREE.CylinderGeometry(0.022, 0.022, 1.95, 10, 1, true);
  return { steps, column, count, stepY };
}
