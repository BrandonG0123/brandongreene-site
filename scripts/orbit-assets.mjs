#!/usr/bin/env node
/**
 * Offline assets for the About opening ("Orbit"):
 *
 *   public/about/orbit/calibration.bin   the foot scanner's real calibration
 *                                        object, simplified to a few thousand
 *                                        triangles for the Projects piece
 *
 *   node scripts/orbit-assets.mjs        (also part of npm run render:about)
 *
 * The STL is 815 KB; the page only needs its shape at the size of a piece on
 * the ring. The mesh is centred, scaled to fit a unit sphere, rotated Y-up,
 * quantised to int16 and written with a uint16 index:
 *   uint32 vertexCount, uint32 indexCount, int16[vertexCount*3], uint16[indexCount]
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TARGET_TRIANGLES = 3200;

const stl = fs.readFileSync('public/models/footscan-calibration-object.stl');
let g = new STLLoader().parse(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength));
g.deleteAttribute('normal');
g = mergeVertices(g, 1e-3);
g.rotateX(-Math.PI / 2); // STL is Z-up
const before = g.index.count / 3;
const remove = Math.max(0, g.attributes.position.count - Math.round(TARGET_TRIANGLES / 2));
g = await new SimplifyModifier().modify(g, remove);
g = mergeVertices(g, 1e-4);

g.computeBoundingBox();
const c = g.boundingBox.getCenter(new THREE.Vector3());
g.translate(-c.x, -c.y, -c.z);
let r = 0;
const p = g.attributes.position;
for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
g.scale(1 / r, 1 / r, 1 / r);

const vc = p.count, ic = g.index.count;
if (vc > 65535) throw new Error('too many vertices for a uint16 index');
const buf = Buffer.alloc(8 + vc * 6 + ic * 2);
buf.writeUInt32LE(vc, 0);
buf.writeUInt32LE(ic, 4);
for (let i = 0; i < vc; i++) for (let k = 0; k < 3; k++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p.array[i * 3 + k])) * 32767), 8 + (i * 3 + k) * 2);
}
for (let i = 0; i < ic; i++) buf.writeUInt16LE(g.index.array[i], 8 + vc * 6 + i * 2);
fs.mkdirSync('public/about/orbit', { recursive: true });
fs.writeFileSync('public/about/orbit/calibration.bin', buf);
console.log(`calibration: ${before} → ${ic / 3} triangles, ${vc} vertices, ${(buf.length / 1024).toFixed(1)} KB`);
