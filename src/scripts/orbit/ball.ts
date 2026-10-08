/**
 * The ball's pose over time, shared by the opening video and the live scene
 * so the points released by the scan leave from exactly where the felt was.
 *
 * Through the scan the ball sits at the origin and turns about the vertical,
 * so a point's height (and with it the moment the scan line reaches it) never
 * changes as it turns. Before that it's in flight; the video alone shows that,
 * and the flight path lands on this pose at the start of the scan.
 */
import * as THREE from 'three';
import { SCORE } from './score';
import { BALL_R } from './layout';

/** The seam's tilt and a little roll, fixed: the ball turns about world Y on top of it. */
export const BASE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.3, -0.18));

/**
 * Spin angle about world Y. Fast in flight (it's just been hit), easing to a
 * slow turn by the time it's being scanned, and never quite stopping.
 */
export function spinAt(t: number) {
  const fast = 7.5, slow = 0.32, tau = 0.9;
  // Integral of slow + (fast - slow)·e^(−t/τ).
  return slow * t + (fast - slow) * tau * (1 - Math.exp(-t / tau));
}

const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
/** World orientation at time t (from the scan onward, and as the flight's end pose). */
export function orientationAt(t: number, out = new THREE.Quaternion()) {
  return out.copy(q.setFromAxisAngle(Y, spinAt(t))).multiply(BASE);
}

/** The scan line's height at time t: it climbs from just under the ball to just over it. */
export function scanY(t: number) {
  const [a, b] = SCORE.scan;
  const k = (t - a) / (b - a);
  return -BALL_R * 1.04 + k * BALL_R * 2.08;
}

/** When the scan line reaches a point at world height y. */
export function scanTime(y: number) {
  const [a, b] = SCORE.scan;
  return a + ((y + BALL_R * 1.04) / (BALL_R * 2.08)) * (b - a);
}
