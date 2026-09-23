#!/usr/bin/env node
/**
 * "Every link resolves or is not shown."
 *
 * Internal links are checked against the built output. External links are
 * checked over the network unless --skip-external is passed.
 */
import fs from 'node:fs';
import { serveDist, builtPages } from './lib/serve.mjs';
import { SITE } from '../astro.config.mjs';

const SITE_ORIGIN = new URL(SITE).origin;

const skipExternal = process.argv.includes('--skip-external');
const { server, port } = await serveDist();
const pages = builtPages();

const internal = new Map();
const external = new Map();

for (const route of pages) {
  const file = route === '/' ? 'dist/index.html' : `dist${route}/index.html`;
  const html = fs.readFileSync(fs.existsSync(file) ? file : `dist${route}.html`, 'utf8');
  const refs = [
    ...[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    // Social card images are URLs a reader hits on every share preview.
    ...[...html.matchAll(/<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]*content="([^"]+)"/g)].map(
      (m) => m[1]
    ),
  ];

  for (const href of refs) {
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('data:')) continue;

    // Canonical URLs, og:url and any other self-reference point at the site's
    // own origin, which does not resolve until the site is deployed. Check the
    // PATH against the build instead — that is the thing that can actually rot.
    let key = href;
    let isExternal = href.startsWith('http');
    if (isExternal && href.startsWith(SITE_ORIGIN)) {
      key = new URL(href).pathname.replace(/\/$/, '') || '/';
      isExternal = false;
    }

    const target = isExternal ? external : internal;
    if (!target.has(key)) target.set(key, new Set());
    target.get(key).add(route);
  }
}

let broken = 0;
const report = (href, from, status) => {
  broken++;
  console.error(`BROKEN ${status}  ${href}`);
  console.error(`  linked from: ${[...from].join(', ')}`);
};

for (const [href, from] of internal) {
  const res = await fetch(`http://localhost:${port}${href}`).catch(() => null);
  if (!res || !res.ok) report(href, from, res ? res.status : 'no response');
}

if (skipExternal) {
  console.log(`Skipped ${external.size} external link(s).`);
} else {
  for (const [href, from] of external) {
    const res = await fetch(href, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
    // Some hosts reject HEAD; retry with GET before calling it broken.
    if (!res || !res.ok) {
      const retry = await fetch(href, { redirect: 'follow' }).catch(() => null);
      if (!retry || !retry.ok) report(href, from, retry ? retry.status : 'unreachable');
    }
  }
}

server.close();
console.log(`\nChecked ${internal.size} internal and ${skipExternal ? 0 : external.size} external link(s) across ${pages.length} pages.`);
if (broken) {
  console.error(`${broken} broken link(s). Build fails.`);
  process.exit(1);
}
console.log('All links resolve.');
