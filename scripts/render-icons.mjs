#!/usr/bin/env node
/**
 * Render the iPhone home-screen icon from the favicon's drawing.
 *
 * iOS ignores SVG icons, rounds the corners itself and shows transparency as
 * black, so the touch icon is a full-bleed square with the ball a little smaller
 * than in the favicon. Re-run after changing public/favicon.svg:
 *
 *   npm run render:icons
 */
import fs from 'node:fs';
import sharp from 'sharp';

const fav = fs.readFileSync('public/favicon.svg', 'utf8');
const ball = fav.match(/<circle[\s\S]*?\/>\s*<path[\s\S]*?\/>/);
if (!ball) throw new Error('could not find the ball in public/favicon.svg');
const bg = fav.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? '#05060A';

const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="${bg}"/>
  <g transform="translate(90 90) scale(5.2) translate(-16 -16)">${ball[0].replace('stroke-width="2"', 'stroke-width="1.6"')}</g>
</svg>`;

await sharp(Buffer.from(touch)).png({ compressionLevel: 9 }).toFile('public/apple-touch-icon.png');
console.log('wrote public/apple-touch-icon.png (180×180)');
