/**
 * Small shared pieces: deterministic random numbers, and the tennis ball's
 * seam curve (used by both the printed ball on the ring and the film's ball).
 */
import * as THREE from 'three';

/** Deterministic random numbers, so every visit draws the same shapes. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seam of a tennis ball: two interlocking lobes on the sphere.
 * x = a cos t + b cos 3t, y = a sin t − b sin 3t, z = 2√(ab) sin 2t with a + b = 1
 * lies exactly on the unit sphere. Tilted so it reads as a ball, not a logo.
 */
const SEAM_TILT = new THREE.Euler(0.55, 0.3, 0.2);
export function seamPoint(t: number, out = new THREE.Vector3()) {
  const a = 0.72, b = 0.28;
  out.set(a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t));
  return out.applyEuler(SEAM_TILT);
}
