#!/usr/bin/env node
/**
 * Checks the home page's guided scroll ("See the work", src/scripts/tour.ts)
 * against the built site:
 *
 *   npm run build && node scripts/check-tour.mjs
 *
 *  - desktop and phone: it runs to the end, each sentence of the serve is fully
 *    on screen for a while, and it lands on the work with focus and #work
 *  - the reader stays in charge: a wheel turn stops it in place, a key skips
 *  - reduced motion: an ordinary jump, no tour
 *
 * Not part of `npm test` (it takes about a minute). Safari behaves differently
 * from Chromium here; also try it in the iOS Simulator after changing the tour.
 */
import { chromium } from 'playwright';
import { serveDist } from './lib/serve.mjs';

const { server, port } = await serveDist('dist', 4393);
const BASE = `http://localhost:${port}`;
const browser = await chromium.launch();
let failed = false;
const report = (ok, name, detail) => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function open(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: !!opts.phone,
    hasTouch: !!opts.phone,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  return { ctx, page };
}

const workState = (page) =>
  page.evaluate(() => {
    const w = document.getElementById('work');
    const m = parseFloat(getComputedStyle(w).scrollMarginTop) || 0;
    return {
      offBy: Math.round(Math.abs(w.getBoundingClientRect().top - m)),
      hash: location.hash,
      focus: document.activeElement?.id ?? '',
      touring: 'touring' in document.documentElement.dataset,
    };
  });

// Full run: sample which sentence is fully visible, frame by frame.
for (const phone of [false, true]) {
  const name = phone ? 'phone' : 'desktop';
  const { ctx, page } = await open({ phone });
  await page.evaluate(() => {
    window.__beats = [];
    const beats = [...document.querySelectorAll('[data-beat]')];
    const tick = (now) => {
      window.__beats.push([now, beats.findIndex((b) => +b.style.opacity > 0.95)]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = await page.evaluate(() => performance.now());
  await (phone ? page.tap('a[data-tour]') : page.click('a[data-tour]'));
  await page.waitForFunction(() => !('touring' in document.documentElement.dataset), null, { timeout: 30000, polling: 100 });
  const took = ((await page.evaluate(() => performance.now())) - t0) / 1000;
  const held = await page.evaluate(() => {
    const spans = {};
    for (const [t, b] of window.__beats) if (b >= 0) (spans[b] ||= [t, t])[1] = t;
    return [0, 1].map((b) => (spans[b] ? (spans[b][1] - spans[b][0]) / 1000 : 0));
  });
  const end = await workState(page);
  report(took > 8 && took < 14, `${name}: runs at reading pace`, `${took.toFixed(1)} s`);
  report(held.every((s) => s > 1.5), `${name}: each sentence holds on screen`, held.map((s) => `${s.toFixed(1)} s`).join(', '));
  report(end.offBy < 3 && end.hash === '#work' && end.focus === 'featured-heading', `${name}: lands on the work`, JSON.stringify(end));
  await ctx.close();
}

// A wheel turn stops it where it is.
{
  const { ctx, page } = await open();
  await page.click('a[data-tour]');
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 10);
  await page.waitForTimeout(150);
  const a = await page.evaluate(() => scrollY);
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => ({ y: scrollY, touring: 'touring' in document.documentElement.dataset }));
  report(Math.abs(b.y - a) < 2 && !b.touring, 'a wheel turn stops it in place');
  await ctx.close();
}

// A key skips to the work.
{
  const { ctx, page } = await open();
  await page.focus('a[data-tour]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const s = await workState(page);
  report(s.offBy < 3 && s.focus === 'featured-heading', 'a key skips to the work', JSON.stringify(s));
  await ctx.close();
}

// Reduced motion: the ordinary jump.
{
  const { ctx, page } = await open({ reduced: true });
  await page.click('a[data-tour]');
  await page.waitForTimeout(500);
  const s = await workState(page);
  report(s.offBy < 3 && !s.touring, 'reduced motion: an ordinary jump', JSON.stringify(s));
  await ctx.close();
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
