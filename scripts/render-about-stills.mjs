#!/usr/bin/env node
/**
 * Render the About intro's stills from the real scene:
 *   public/about/poster.{avif,webp}         the ball, shown while three.js loads
 *   public/about/pieces/<piece>.{avif,webp}  each piece, for reduced motion, no
 *                                            capable GPU, and no JavaScript
 *
 *   npm run render:about
 *
 * (That also re-samples the calibration object's points first; see
 * sample-intro-points.mjs.) Re-run after changing anything under
 * src/scripts/intro/. Renders on the Mac's GPU when there is one, otherwise
 * in software, which is slower but identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serveDist } from './lib/serve.mjs';

const OUT = 'public/about';
const PIECES = ['ball', 'knight', 'calibration', 'network', 'gyroid'];
fs.mkdirSync(path.join(OUT, 'pieces'), { recursive: true });

const { server, port } = await serveDist('dist', 4396);
const gpu = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: gpu });

async function capture(capture, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.addInitScript((c) => { window.__introCapture = c; }, capture);
  await page.goto(`http://localhost:${port}/about/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-intro][data-captured]', { timeout: 120_000 });
  const url = await page.evaluate(() => document.querySelector('[data-intro-canvas]').toDataURL('image/png'));
  await page.close();
  return Buffer.from(url.split(',')[1], 'base64');
}

const save = async (png, name, width) => {
  const img = sharp(png).resize({ width });
  await img.clone().avif({ quality: 55, effort: 6 }).toFile(path.join(OUT, `${name}.avif`));
  await img.clone().webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
  console.log(`${name}: ${kb(`${name}.avif`)} KB avif, ${kb(`${name}.webp`)} KB webp`);
};

// The stage is the viewport minus the header (4.25rem = 68px).
await save(await capture({ mode: 'poster' }, { width: 1600, height: 968 }), 'poster', 1600);
for (const [i, name] of PIECES.entries()) {
  await save(await capture({ mode: 'piece', piece: i }, { width: 520, height: 588 }), `pieces/${name}`, 480);
}

await browser.close();
server.close();
