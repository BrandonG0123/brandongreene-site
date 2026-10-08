/**
 * The score: when everything happens, in seconds. One clock drives the
 * opening video, the live scene and the sound, so they can't drift apart.
 * The video owns 0 → VIDEO_END; the live scene starts drawing at SCAN.start.
 */
import type { Key } from './emblems';

export const SCORE = {
  /** The ball's flight and ignition: video only. */
  flight: [0, 1.1],
  ignition: [1.1, 2.7],
  /** The scan line climbs the ball: the video shows the felt above it, the live scene the points below. */
  scan: [2.7, 3.75] as [number, number],
  videoEnd: 3.8,
  /** The camera pulls back from the ball to the ring. */
  pullBack: [3.8, 5.0] as [number, number],
  /** Each piece prints in turn round the ring. */
  printStart: 4.15,
  printStagger: 0.27,
  printDur: 1.0,
  /** Threads of light from each piece back to the centre; the steps light as they land. */
  threadStart: 6.35,
  threadStagger: 0.11,
  threadDur: 0.95,
  stepsLit: [6.95, 8.05] as [number, number],
  centreLabel: 7.9,
  /** Tennis shows what every piece does: its items fan out. */
  open: 8.45,
  /** Title and controls; from here only the helix turns. */
  reveal: 9.9,
  end: 11.6,
};

/** The ring, clockwise from the top left on wide screens (from the top on tall ones). */
export const ORDER: Key[] = ['tennis', 'school', 'projects', 'coding', 'hobbies', 'mind'];

export const printWindow = (k: number): [number, number] => {
  const s = SCORE.printStart + k * SCORE.printStagger;
  return [s, s + SCORE.printDur];
};
export const threadWindow = (k: number): [number, number] => {
  const s = SCORE.threadStart + k * SCORE.threadStagger;
  return [s, s + SCORE.threadDur];
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
