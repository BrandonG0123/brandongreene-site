#!/usr/bin/env node
/**
 * Render the opening film and encode it for the page.
 *
 *   cd video && npm install && npm run render            both cuts
 *   npm run render -- opening-9x16                       one cut
 *
 * Writes into ../public/about/orbit/:
 *   opening-16x9.mp4 / .webm, opening-9x16.mp4 / .webm   the film (no sound:
 *                                                        the page synthesises it)
 *   opening-16x9.webp / .avif, opening-9x16.webp / .avif the first frame, shown
 *                                                        until the film plays
 *
 * Remotion renders a near-lossless master; the system ffmpeg makes the web
 * encodes from it (H.264 for Safari, VP9 for the rest). On a Mac it uses the
 * GPU; in a cloud container it renders in software, which is slow (minutes
 * per second of film) but identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const OUT = path.resolve('../public/about/orbit');
const MASTER = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(MASTER, { recursive: true });
const sharp = createRequire(path.resolve('../package.json'))('sharp');

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const cuts = ids.length ? ids : ['opening-16x9', 'opening-9x16'];

// Linux: Playwright's headless shell, software WebGL. Mac: Remotion's own.
const linux = process.platform === 'linux';
const browserExecutable = linux && fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
  ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : undefined;
const chromiumOptions = { gl: linux ? 'swangle' : 'angle' };

const serveUrl = await bundle({
  entryPoint: path.resolve('src/index.ts'),
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      modules: [path.resolve('node_modules'), path.resolve('../node_modules'), 'node_modules'],
      alias: { ...(config.resolve?.alias ?? {}), 'three$': path.resolve('../node_modules/three/build/three.module.js'), 'three/addons': path.resolve('../node_modules/three/examples/jsm') },
    },
  }),
});

for (const id of cuts) {
  const t0 = Date.now();
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions });
  const master = path.join(MASTER, `${id}-master.mp4`);
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: 4, outputLocation: master,
    browserExecutable, chromiumOptions, concurrency: Number(process.env.CONCURRENCY ?? 2),
    colorSpace: 'bt709', muted: true, timeoutInMilliseconds: 600_000,
    onProgress: ({ progress }) => process.stdout.write(`\r${id}: ${(progress * 100).toFixed(0)}%   `),
  });
  process.stdout.write('\n');

  // Web encodes: small, no audio track, fast start.
  const base = path.join(OUT, id);
  const color = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
    '-pix_fmt', 'yuv420p', ...color, '-movflags', '+faststart', `${base}.mp4`]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', ...color, `${base}.webm`]);

  // The poster: exactly the film's first frame.
  const png = path.join(MASTER, `${id}-poster.png`);
  await renderStill({ composition, serveUrl, frame: 0, output: png, browserExecutable, chromiumOptions, timeoutInMilliseconds: 600_000 });
  await sharp(png).webp({ quality: 80 }).toFile(`${base}.webp`);
  await sharp(png).avif({ quality: 52, effort: 6 }).toFile(`${base}.avif`);

  const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`;
  console.log(`${id}: ${((Date.now() - t0) / 60000).toFixed(1)} min · mp4 ${kb(`${base}.mp4`)} · webm ${kb(`${base}.webm`)} · poster ${kb(`${base}.webp`)}`);
}
