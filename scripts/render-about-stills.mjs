#!/usr/bin/env node
/**
 * Render the About opening's stills from the real scene:
 *   public/about/orbit/pieces/<piece>.{avif,webp}   each piece printed whole,
 *                                                   and the centre's staircase,
 *                                                   for reduced motion, no
 *                                                   capable GPU, and no JavaScript
 *
 *   npm run render:about
 *
 * (That also rebuilds the simplified calibration mesh first; see
 * orbit-assets.mjs.) Re-run after changing anything under src/scripts/orbit/.
 * The opening film is rendered separately (npm run render:film; video/).
 * Renders on the Mac's GPU when there is one, otherwise in software, which is
 * slower but identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serveDist } from './lib/serve.mjs';

const OUT = 'public/about/orbit/pieces';
const PIECES = ['tennis', 'school', 'projects', 'coding', 'hobbies', 'mind', 'centre'];
fs.mkdirSync(OUT, { recursive: true });

const { server, port } = await serveDist('dist', 4396);
const gpu = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ args: gpu, executablePath });

for (const name of PIECES) {
  // The stage is the viewport minus the header (4.25rem = 68px): a square here.
  const page = await browser.newPage({ viewport: { width: 540, height: 608 }, deviceScaleFactor: 2 });
  await page.addInitScript((iso) => { window.__orbitCapture = { isolate: iso }; }, name);
  await page.goto(`http://localhost:${port}/about/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-orbit][data-captured]', { timeout: 300_000 });
  const url = await page.evaluate(() => document.querySelector('[data-orbit-canvas]').toDataURL('image/png'));
  await page.close();
  const img = sharp(Buffer.from(url.split(',')[1], 'base64')).resize({ width: 480 });
  await img.clone().avif({ quality: 60, effort: 6 }).toFile(path.join(OUT, `${name}.avif`));
  await img.clone().webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
  console.log(`${name}: ${kb(`${name}.avif`)} KB avif, ${kb(`${name}.webp`)} KB webp`);
}

await browser.close();
server.close();
