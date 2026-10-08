/**
 * Where things sit, for a stage of any shape, and where the camera is.
 *
 * The ring is laid out in screen terms (fractions of the visible half-width
 * and half-height at the ring's depth) so it fills wide and tall screens
 * alike: a flat-topped hexagon on wide screens, a pointed one on tall ones.
 * The camera starts close on the ball (where the opening video hands over)
 * and pulls back to frame the ring.
 */
import * as THREE from 'three';
import { SCORE, ramp, easeInOut } from './score';

export const FOV = 30;
export const BALL_R = 0.62;
const TAN = Math.tan((FOV * Math.PI) / 360);

/** The opening video is rendered at one of two shapes; the stage picks the nearer. */
export const videoAspect = (stageAspect: number) => (stageAspect >= 1 ? 16 / 9 : 9 / 16);

/**
 * Camera distance for the close-up on the ball, for a given video shape: on a
 * wide video the ball fills a bit over half the height, on a tall one most of
 * the width.
 */
export const closeDistance = (va: number) => Math.max(BALL_R / (TAN * 0.56), BALL_R / (TAN * va * 0.8));

/**
 * The stage shows the video "cover"-cropped, so while the video is up the
 * live camera must see exactly the same crop: the same camera with a narrower
 * field of view when the stage is wider than the video.
 */
export const coverFov = (va: number, stageAspect: number) =>
  (2 * Math.atan(TAN * Math.min(1, va / stageAspect)) * 180) / Math.PI;

export interface Layout {
  tall: boolean;
  /** Stage and video shapes. */
  aspect: number;
  videoAspect: number;
  /** Distance of the camera from the ring at rest. */
  far: number;
  /** World positions of the six pieces, in ring order. */
  slots: THREE.Vector3[];
  /** World radius of each piece. */
  size: number;
  /** The helix at the centre: position and height scale. */
  centre: THREE.Vector3;
  centreScale: number;
  /** Pixels per world unit at the ring's depth. */
  pxPerWorld: number;
  /** The ellipse the pieces sit on (world radii), for the orbit line. */
  orbit: { rx: number; ry: number };
}

const WIDE: [number, number][] = [[-0.31, 0.47], [0.31, 0.47], [0.62, 0.0], [0.31, -0.47], [-0.31, -0.47], [-0.62, 0.0]];
const TALL: [number, number][] = [[0, 0.44], [0.62, 0.22], [0.62, -0.22], [0, -0.44], [-0.62, -0.22], [-0.62, 0.22]];
const FAR = 8.4;

export function layout(W: number, H: number): Layout {
  const aspect = W / H, tall = aspect < 1.1;
  const halfH = FAR * TAN, halfW = halfH * aspect;
  // Room for the title: above the ring on tall screens (with the open list and
  // the controls under it), to its left on wide ones.
  const radiusPx = tall ? Math.min(W * 0.1, H * 0.052) : Math.min(W * 0.05, H * 0.086);
  let lift = 0.04, yScale = 1;
  if (tall) {
    // The ring has to fit between the title (about 78px at the top) and the
    // controls with an open category's list above them (about 216px at the
    // bottom). On a short phone it squeezes vertically to fit; then it sits
    // with its top piece just under the title.
    yScale = Math.max(0.6, Math.min(1, (H - 334 - 2.12 * radiusPx) / (0.44 * H)));
    lift = Math.max(0.2, Math.min(0.34, (H / 2 - 78 - radiusPx) / (H / 2) - 0.44 * yScale));
  }
  const shift = tall ? 0 : 0.075;
  const slots = (tall ? TALL : WIDE).map(([x, y]) => new THREE.Vector3((x + shift) * halfW, (y * yScale + lift) * halfH, 0));
  const pxPerWorld = H / (2 * halfH);
  return {
    tall, aspect, videoAspect: videoAspect(aspect), far: FAR, slots,
    size: radiusPx / pxPerWorld,
    centre: new THREE.Vector3(shift * halfW, lift * halfH, 0),
    // The staircase shrinks with a squeezed ring, so it and its label stay clear of the pieces.
    centreScale: (tall ? Math.min(W * 0.15, H * 0.075) * Math.pow(yScale, 1.5) : H * 0.15) / pxPerWorld,
    pxPerWorld,
    // The hexagon's corners lie on this ellipse (see WIDE and TALL).
    orbit: tall ? { rx: 0.716 * halfW, ry: 0.44 * halfH * yScale } : { rx: 0.62 * halfW, ry: 0.543 * halfH },
  };
}

/** The camera at score time t, leaning toward the pointer (−1…1) once the ring is up. */
export function cameraAt(cam: THREE.PerspectiveCamera, L: Layout, t: number, lean: { x: number; y: number }) {
  const k = easeInOut(ramp(t, SCORE.pullBack[0], SCORE.pullBack[1]));
  const near = closeDistance(L.videoAspect);
  const d = near + (L.far - near) * k;
  const fov = coverFov(L.videoAspect, L.aspect) + (FOV - coverFov(L.videoAspect, L.aspect)) * k;
  if (Math.abs(cam.fov - fov) > 1e-4 || cam.aspect !== L.aspect) {
    cam.fov = fov;
    cam.aspect = L.aspect;
    cam.updateProjectionMatrix();
  }
  // The camera always aims at the origin (where the ball was); the layout
  // offsets the ring itself to leave room for the title.
  cam.position.set(lean.x * 0.45 * k, 0.18 * k + lean.y * 0.3 * k, d);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
}
