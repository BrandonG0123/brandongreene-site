#!/usr/bin/env node
/**
 * Sample the foot scanner's calibration object into the points the About intro
 * uses. The STL is 815 KB; the intro needs only its surface as points, so this
 * writes int16 triples (~120 KB) to public/about/calibration-points.bin.
 *
 * Uses the same sampling code as the page (src/scripts/intro/shapes.ts), so the
 * two can't drift. Part of `npm run render:about`; re-run if the STL changes.
 */
import fs from 'node:fs';
import { calibrationFromSTL, encodeCloud, CALIBRATION_POINTS } from '../src/scripts/intro/shapes.ts';

const src = 'public/models/footscan-calibration-object.stl';
const out = 'public/about/calibration-points.bin';
const stl = fs.readFileSync(src);
const cloud = calibrationFromSTL(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength), CALIBRATION_POINTS);
fs.mkdirSync('public/about', { recursive: true });
fs.writeFileSync(out, Buffer.from(encodeCloud(cloud).buffer));
console.log(`${out}: ${CALIBRATION_POINTS} points, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
