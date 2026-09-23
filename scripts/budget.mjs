#!/usr/bin/env node
/**
 * Performance budget, enforced on the built output.
 *
 * Budgets come from the project brief:
 *   - under 100 KB of JavaScript, total, across the whole site
 *   - fonts kept in check so they cannot quietly grow
 *
 * LCP is enforced separately by Lighthouse CI (.lighthouserc.json), which
 * measures it on a throttled connection.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGETS = {
  js: 100 * 1024,
  fonts: 200 * 1024,
  css: 60 * 1024,
};

const collect = (dir, ext, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full, ext, acc);
    else if (ext.includes(path.extname(e.name))) acc.push(full);
  }
  return acc;
};

const sum = (files) => files.reduce((n, f) => n + fs.statSync(f).size, 0);
const gz = (files) =>
  files.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(f)).length, 0);

// Inline <script> bytes count toward the JS budget too — they are still parsed.
const inlineJs = collect('dist', ['.html'])
  .flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)])
  .filter((m) => !/type=["']application\/ld\+json["']/.test(m[0]))
  .reduce((n, m) => n + Buffer.byteLength(m[1]), 0);

const groups = {
  js: { files: collect('dist', ['.js', '.mjs']), extra: inlineJs },
  fonts: { files: collect('dist', ['.woff2', '.woff', '.ttf']), extra: 0 },
  css: { files: collect('dist', ['.css']), extra: 0 },
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let failed = false;

console.log('Performance budget\n');
for (const [name, { files, extra }] of Object.entries(groups)) {
  const raw = sum(files) + extra;
  const budget = BUDGETS[name];
  const ok = raw <= budget;
  if (!ok) failed = true;
  const note = name === 'js' && extra ? ` (${kb(extra)} inline)` : '';
  // woff2 is already compressed, so a gzip figure for it is misleading; and a
  // gzip column for zero files reads as 0 KB when the real payload is inline.
  const gzipCol = name === 'fonts' || files.length === 0 ? '' : `  gzip ${kb(gz(files)).padStart(9)}`;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(6)} ${kb(raw).padStart(9)}${note}` +
      `${gzipCol}  budget ${kb(budget).padStart(9)}  (${files.length} file${files.length === 1 ? '' : 's'})`
  );
}

if (failed) {
  console.error('\nOver budget. Build fails.');
  process.exit(1);
}
console.log('\nWithin budget.');
