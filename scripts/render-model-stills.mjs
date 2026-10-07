#!/usr/bin/env node
/**
 * Render a still of every project's 3D model, for its card on the home page
 * and the projects index.
 *
 * The cards can't load three.js — that would put ~157 KB of 3D in front of the
 * home page. So each still is captured from the project's real model viewer,
 * offline, and the card shows that image. Re-run after adding or changing a
 * project's model:
 *
 *   npm run build && npm run render:models
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serveDist } from './lib/serve.mjs';

const OUT = 'public/models/stills';
fs.mkdirSync(OUT, { recursive: true });

// Every built project page that has a viewer.
const projectsDir = 'dist/projects';
const slugs = fs.readdirSync(projectsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((slug) => fs.readFileSync(path.join(projectsDir, slug, 'index.html'), 'utf8').includes('data-viewer'));

if (!slugs.length) {
  console.log('No project pages with a model viewer. Nothing to render.');
  process.exit(0);
}

const { server, port } = await serveDist('dist', 4398);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });

for (const slug of slugs) {
  await page.goto(`http://localhost:${port}/projects/${slug}/`, { waitUntil: 'load' });
  const stage = page.locator('.viewer__stage');
  await stage.scrollIntoViewIfNeeded();
  await page.waitForSelector('.viewer--ready', { timeout: 60_000 });
  // Stop the auto-rotation and return to the composed starting angle.
  await page.click('[data-viewer-pause]');
  await page.click('[data-viewer-reset]');
  await page.waitForTimeout(1500);
  // Hide the corner ticks (the card draws its own frame) and the sticky header,
  // which otherwise sits over the top of the stage in the capture.
  await page.addStyleTag({ content: '.viewer__stage::before,.viewer__stage::after,.site-header{display:none!important}' });
  await page.waitForTimeout(300);
  const png = await stage.screenshot();
  const img = sharp(png).resize({ width: 1200 });
  await img.clone().avif({ quality: 55, effort: 6 }).toFile(path.join(OUT, `${slug}.avif`));
  await img.clone().webp({ quality: 80 }).toFile(path.join(OUT, `${slug}.webp`));
  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
  console.log(`${slug}: ${kb(`${slug}.avif`)} KB avif, ${kb(`${slug}.webp`)} KB webp`);
}

await browser.close();
server.close();
