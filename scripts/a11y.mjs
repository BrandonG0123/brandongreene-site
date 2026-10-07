#!/usr/bin/env node
/**
 * axe-core against every built page, in BOTH themes, at three viewports.
 *
 * Exits non-zero on any violation, which fails the build in CI.
 *
 * This catches roughly a third of real accessibility problems. It cannot judge
 * focus order, alt text quality, or whether a page makes sense read aloud.
 * docs/manual-a11y-test.md is the part that matters — run it before launch.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { serveDist, builtPages } from './lib/serve.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];
const THEMES = ['light', 'dark'];

const { server, port } = await serveDist();
const pages = builtPages();
const browser = await chromium.launch();

let violations = 0;
let checks = 0;

console.log(`axe-core — ${pages.length} pages x ${THEMES.length} themes x ${VIEWPORTS.length} viewports\n`);

for (const theme of THEMES) {
  // The site does not follow the OS theme: dark is the design, and "reading
  // mode" (light) is a stored choice. So select the theme the way a visitor
  // does — via the remembered preference — rather than emulating the OS, which
  // would test the dark theme twice and never touch reading mode.
  const context = await browser.newContext({ colorScheme: theme });
  await context.addInitScript((t) => {
    try { localStorage.setItem('theme', t); } catch {}
  }, theme);
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const route of pages) {
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'load' });
      const applied = await page.evaluate(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
      if (applied !== theme) {
        console.error(`FAIL ${route}  expected ${theme} theme, page rendered ${applied}`);
        violations++;
        continue;
      }
      const { violations: v } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      checks++;

      if (v.length) {
        violations += v.length;
        console.error(`FAIL ${route}  [${theme}/${vp.name}]`);
        for (const item of v) {
          console.error(`  ${item.id} (${item.impact}) — ${item.help}`);
          for (const node of item.nodes.slice(0, 3)) {
            console.error(`    ${node.target.join(' ')}`);
          }
          console.error(`    ${item.helpUrl}`);
        }
      }
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
server.close();

console.log(`\n${checks} page checks run.`);
if (violations) {
  console.error(`\n${violations} violation(s). Build fails.`);
  process.exit(1);
}
console.log('0 violations.');
console.log('\nReminder: automated tooling catches roughly a third of real issues.');
console.log('The manual pass in docs/manual-a11y-test.md is the part that matters.');
