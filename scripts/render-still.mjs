#!/usr/bin/env node
/**
 * Render the hero gyroid to a still image, offline.
 *
 * Visitors without real GPU rendering (and reduced-capability browsers) get this
 * instead of the live shader. It is rendered from the SAME shader source as the
 * live hero, with the same uniforms, so the fallback is the real thing rather
 * than an approximation. Re-run whenever the shader changes:
 *
 *   npm run render:still
 *
 * Software rendering is slow, but this runs once, offline — nobody waits on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const src = fs.readFileSync('src/scripts/gyroid.ts', 'utf8');
const grab = (name) => {
  const m = src.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  if (!m) throw new Error(`could not find ${name} in gyroid.ts`);
  return m[1];
};
const VERT = grab('VERT');
const FRAG = grab('FRAG');

const W = 2880, H = 1800;
const COLOURS = { ice: '#4DF3FF', violet: '#8B5CFF', ball: '#D4FF3A', bg: '#05060A', ink: '#EEF2F7' };

const html = `<!doctype html><canvas id="c" width="${W}" height="${H}"></canvas>`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent(html);

const dataUrl = await page.evaluate(
  ({ VERT, FRAG, W, H, COLOURS }) => {
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const c = document.getElementById('c');
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(p, n);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(U('uRes'), W, H);
    gl.uniform1f(U('uTime'), 7.0);          // the same flattering angle the live hero starts at
    gl.uniform2f(U('uMouse'), 0, 0);
    gl.uniform1f(U('uScroll'), 0);
    gl.uniform1f(U('uOffset'), 0.58);       // wide-screen composition
    gl.uniform1f(U('uDim'), 1);
    gl.uniform1f(U('uLight'), 0);
    gl.uniform3fv(U('uIce'), hex(COLOURS.ice));
    gl.uniform3fv(U('uViolet'), hex(COLOURS.violet));
    gl.uniform3fv(U('uBall'), hex(COLOURS.ball));
    gl.uniform3fv(U('uBg'), hex(COLOURS.bg));
    gl.uniform3fv(U('uInk'), hex(COLOURS.ink));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    return c.toDataURL('image/png');
  },
  { VERT, FRAG, W, H, COLOURS },
);
await browser.close();

const png = Buffer.from(dataUrl.split(',')[1], 'base64');
fs.mkdirSync('public/hero', { recursive: true });
const base = sharp(png).resize(W, H);
await base.clone().avif({ quality: 52, effort: 6 }).toFile('public/hero/gyroid-still.avif');
await base.clone().webp({ quality: 78 }).toFile('public/hero/gyroid-still.webp');

for (const f of ['gyroid-still.avif', 'gyroid-still.webp']) {
  const kb = (fs.statSync(path.join('public/hero', f)).size / 1024).toFixed(1);
  console.log(`public/hero/${f}  ${kb} KB  (${W}x${H})`);
}
