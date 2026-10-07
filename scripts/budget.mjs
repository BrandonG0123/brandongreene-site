#!/usr/bin/env node
/**
 * Performance budget, enforced on the built output.
 *
 * JavaScript is split into two budgets, because they cost the reader different
 * things:
 *
 *   CRITICAL — what a page loads on arrival: its <script> tags, inline scripts,
 *   and every module those statically import. This is what a reader waits on.
 *   The original brief's 100 KB ceiling applies here, per page, unchanged.
 *
 *   LAZY — chunks reached only through a dynamic import(), e.g. the three.js
 *   model viewer, which loads on project pages after the text has painted. The
 *   reader never waits on these. They get their own explicit ceiling, set when
 *   the 3D redesign was approved, so they can't creep either.
 *
 * LCP and layout shift are enforced separately by Lighthouse CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGET = {
  criticalPerPage: 100 * 1024, // raw bytes — the brief's original number
  lazyChunkRaw: 700 * 1024,
  lazyChunkGzip: 200 * 1024,
  fonts: 200 * 1024,
  css: 60 * 1024, // per page, render-blocking
};

const DIST = 'dist';
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (buf) => zlib.gzipSync(buf).length;

const walk = (dir, ext, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, acc);
    else if (ext.includes(path.extname(e.name))) acc.push(full);
  }
  return acc;
};

// --- module graph ---------------------------------------------------------
const jsFiles = walk(DIST, ['.js', '.mjs']);
const read = (f) => fs.readFileSync(f, 'utf8');

/** Static imports of a built module (resolved to files). Dynamic import() excluded. */
function staticImports(file) {
  const src = read(file);
  const out = new Set();
  // import{x}from"./a.js"  |  import"./a.js"  |  export{x}from"./a.js"
  for (const m of src.matchAll(/(?:import|export)\s*(?:[\w*{}\s,$]+from\s*)?["'](\.{1,2}\/[^"']+\.m?js)["']/g)) {
    out.add(path.resolve(path.dirname(file), m[1]));
  }
  return out;
}
function dynamicImports(file) {
  const out = new Set();
  // Vite emits dynamic imports with template literals: import(`./viewer.abc.js`)
  for (const m of read(file).matchAll(/import\(\s*["'`](\.{1,2}\/[^"'`]+\.m?js)["'`]\s*\)/g)) {
    out.add(path.resolve(path.dirname(file), m[1]));
  }
  return out;
}
function closure(entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    for (const d of staticImports(f)) stack.push(d);
  }
  return seen;
}

// --- per-page critical JS -------------------------------------------------
const pages = walk(DIST, ['.html']);
const criticalUnion = new Set();
let failed = false;
const rows = [];

for (const page of pages) {
  const html = read(page);
  const entries = [...html.matchAll(/<script[^>]+src="([^"]+\.m?js)"/g), ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)]
    .map((m) => path.join(DIST, m[1].replace(/^\//, '')));
  const files = closure(entries);
  files.forEach((f) => criticalUnion.add(f));

  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/application\/ld\+json/.test(m[1]))
    .reduce((n, m) => n + Buffer.byteLength(m[2]), 0);

  const raw = [...files].reduce((n, f) => n + fs.statSync(f).size, 0) + inline;
  const ok = raw <= BUDGET.criticalPerPage;
  if (!ok) failed = true;
  rows.push({ page: '/' + path.relative(DIST, page).replace(/index\.html$/, '').replace(/\.html$/, ''), raw, ok });
}

console.log('Critical JavaScript per page (what a reader waits on)\n');
for (const r of rows.sort((a, b) => b.raw - a.raw)) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${kb(r.raw).padStart(9)}  budget ${kb(BUDGET.criticalPerPage)}  ${r.page || '/'}`);
}

// --- lazy chunks ----------------------------------------------------------
const lazyRoots = new Set();
for (const f of jsFiles) for (const d of dynamicImports(f)) lazyRoots.add(d);
const lazy = [...lazyRoots].filter((f) => !criticalUnion.has(f));

console.log('\nLazy chunks (loaded after paint, via dynamic import)\n');
if (!lazy.length) console.log('  none');
for (const root of lazy) {
  const files = [...closure([root])].filter((f) => !criticalUnion.has(f));
  const buf = Buffer.concat(files.map((f) => fs.readFileSync(f)));
  const okRaw = buf.length <= BUDGET.lazyChunkRaw;
  const okGz = gz(buf) <= BUDGET.lazyChunkGzip;
  if (!okRaw || !okGz) failed = true;
  console.log(
    `${okRaw && okGz ? 'PASS' : 'FAIL'}  ${kb(buf.length).padStart(9)} raw  ${kb(gz(buf)).padStart(8)} gzip  ` +
      `budget ${kb(BUDGET.lazyChunkRaw)} / ${kb(BUDGET.lazyChunkGzip)}  ${path.basename(root)}`,
  );
}

// --- fonts & css ----------------------------------------------------------
// CSS is render-blocking, so like critical JS it is budgeted per page: the
// stylesheets a page links to, which a reader waits on before anything paints.
// (It used to be one total across the whole site, which charged every page
// for styles only one page loads, such as the About intro's.) The site-wide
// total is still printed, for reference.
console.log('\nAssets\n');
{
  const files = walk(DIST, ['.woff2', '.woff', '.ttf']);
  const raw = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const ok = raw <= BUDGET.fonts;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  fonts  ${kb(raw).padStart(9)}  budget ${kb(BUDGET.fonts)}  (${files.length} files)`);
}

console.log('\nRender-blocking CSS per page\n');
for (const page of walk(DIST, ['.html'])) {
  const html = read(page);
  let raw = 0;
  for (const m of html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/g)) {
    const href = m[0].match(/href=["']?([^"' >]+)/)?.[1];
    if (href?.startsWith('/')) raw += fs.statSync(path.join(DIST, href)).size;
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) raw += Buffer.byteLength(m[1]);
  const ok = raw <= BUDGET.css;
  if (!ok) failed = true;
  const rel = '/' + path.relative(DIST, page).replace(/index\.html$/, '').replace(/\.html$/, '');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${kb(raw).padStart(9)}  budget ${kb(BUDGET.css)}  ${rel}`);
}
{
  const files = walk(DIST, ['.css']);
  const raw = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(`\n(site-wide CSS, all pages together: ${kb(raw)} in ${files.length} files)`);
}

if (failed) {
  console.error('\nOver budget. Build fails.');
  process.exit(1);
}
console.log('\nWithin budget.');
