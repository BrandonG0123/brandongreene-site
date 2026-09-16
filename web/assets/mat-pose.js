// Camera position from the scan mat's markers.
//
// The idea, step by step:
//
// 1. Correspondences. Each detected marker gives 4 image corners, and the
//    board definition says where those corners are on the mat in millimetres
//    (a flat plane, z = 0).
//
// 2. Homography. For points on a plane, a pinhole camera's projection
//    collapses to a 3x3 matrix H:  [u v 1]^T ~ H [X Y 1]^T.
//    With 4+ points we solve for H by least squares (DLT), after normalising
//    both point sets so the numbers are well conditioned.
//
// 3. Focal length. H = K [r1 r2 t], where K holds the focal length f and
//    r1, r2 are the first two columns of the camera's rotation. Rotation
//    columns are perpendicular and unit length, which gives equations that
//    only f satisfies. When the view is nearly straight-on those equations
//    become degenerate, so we fall back to a typical phone value.
//
// 4. Pose. Undo K, scale so r1 and r2 are unit length, complete the rotation
//    with r3 = r1 x r2, and the camera centre in mat coordinates is -R^T t.
//
// 5. View. The direction from the foot centre to the camera gives azimuth
//    (0 = behind the heel, counter-clockwise seen from above) and elevation.
//
// Each mat sheet is solved on its own, so a crooked tape seam doesn't bias
// anything.

const DEG = 180 / Math.PI;
export const MAX_HAMMING = 5; // see tests/js/detect_markers.cjs for why

/** board JSON -> Map(id -> {sheet, corners: [[X, Y], ...4] in mat mm}) */
export function indexBoard(board) {
  const index = new Map();
  for (const sheet of board.sheets) {
    const [ox, oy] = sheet.origin_mm;
    for (const [id, corners] of Object.entries(sheet.markers)) {
      index.set(Number(id), { sheet: sheet.name, corners: corners.map(([x, y]) => [x + ox, y + oy]) });
    }
  }
  return index;
}

/** Keep only markers on this board, one detection per ID (the largest). */
export function matchDetections(detections, index) {
  const best = new Map();
  for (const d of detections) {
    if (!index.has(d.id)) continue;
    const area = polygonArea(d.corners);
    if (!best.has(d.id) || area > best.get(d.id).area) best.set(d.id, { ...d, area });
  }
  return [...best.values()];
}

function polygonArea(c) {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const [x1, y1] = c[i], [x2, y2] = c[(i + 1) % c.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function normaliser(points) {
  const n = points.length;
  let mx = 0, my = 0;
  for (const [x, y] of points) { mx += x / n; my += y / n; }
  let d = 0;
  for (const [x, y] of points) d += Math.hypot(x - mx, y - my) / n;
  const s = d > 0 ? Math.SQRT2 / d : 1;
  return { T: [[s, 0, -s * mx], [0, s, -s * my], [0, 0, 1]], apply: ([x, y]) => [s * (x - mx), s * (y - my)] };
}

function solve(A, b) {
  // Gaussian elimination with partial pivoting on a square system.
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));

function inv3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/** DLT homography from plane points [X, Y] to image points [u, v] (>= 4 pairs). */
export function homography(plane, image) {
  if (plane.length < 4) return null;
  const np = normaliser(plane), ni = normaliser(image);
  // Normal equations for h (h33 = 1): 8 unknowns.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const addRow = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < plane.length; k++) {
    const [X, Y] = np.apply(plane[k]);
    const [u, v] = ni.apply(image[k]);
    addRow([X, Y, 1, 0, 0, 0, -u * X, -u * Y], u);
    addRow([0, 0, 0, X, Y, 1, -v * X, -v * Y], v);
  }
  const h = solve(AtA, Atb);
  if (!h) return null;
  const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  const TiInv = inv3(ni.T);
  if (!TiInv) return null;
  return mul(mul(TiInv, Hn), np.T); // denormalise: H = Ti^-1 Hn Tp
}

export function project(H, [X, Y]) {
  const w = H[2][0] * X + H[2][1] * Y + H[2][2];
  return [(H[0][0] * X + H[0][1] * Y + H[0][2]) / w, (H[1][0] * X + H[1][1] * Y + H[1][2]) / w];
}

/** Focal length (px) from a homography whose image coords are centred on the principal point. */
export function focalFromHomography(Hc, maxDim) {
  const [h11, h12] = [Hc[0][0], Hc[0][1]], [h21, h22] = [Hc[1][0], Hc[1][1]], [h31, h32] = [Hc[2][0], Hc[2][1]];
  const estimates = [];
  // r1 . r2 = 0
  if (Math.abs(h31 * h32) > 1e-12) estimates.push(-(h11 * h12 + h21 * h22) / (h31 * h32));
  // |r1| = |r2|
  const den = h32 * h32 - h31 * h31;
  if (Math.abs(den) > 1e-12) estimates.push((h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22) / den);
  const good = estimates.filter((f2) => f2 > 0).map(Math.sqrt).filter((f) => f > 0.4 * maxDim && f < 3 * maxDim);
  return good.length ? good.reduce((a, b) => a + b) / good.length : null;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(...a);
const scale = (a, s) => a.map((v) => v * s);
const sub = (a, b) => a.map((v, i) => v - b[i]);

/** Rotation + translation from a centred homography and focal length. Returns camera centre in mat mm. */
export function poseFromHomography(Hc, f) {
  const b1 = [Hc[0][0] / f, Hc[1][0] / f, Hc[2][0]];
  const b2 = [Hc[0][1] / f, Hc[1][1] / f, Hc[2][1]];
  const b3 = [Hc[0][2] / f, Hc[1][2] / f, Hc[2][2]];
  let lambda = 2 / (norm(b1) + norm(b2));
  if (b3[2] * lambda < 0) lambda = -lambda; // the mat must be in front of the camera
  let r1 = scale(b1, lambda), r2 = scale(b2, lambda);
  const t = scale(b3, lambda);
  // Gram-Schmidt: noise leaves r1, r2 slightly non-orthogonal.
  r1 = scale(r1, 1 / norm(r1));
  r2 = sub(r2, scale(r1, dot(r1, r2)));
  r2 = scale(r2, 1 / norm(r2));
  const r3 = cross(r1, r2);
  // Camera centre C = -R^T t, where R's columns are r1, r2, r3.
  const C = [-dot(r1, t), -dot(r2, t), -dot(r3, t)];
  return { R: [r1, r2, r3], t, C };
}

export function viewFromCamera(C, footCenter) {
  const dx = C[0] - footCenter[0], dy = C[1] - footCenter[1];
  const az = (Math.atan2(dx, -dy) * DEG + 360) % 360;
  const el = Math.atan2(C[2], Math.hypot(dx, dy)) * DEG;
  return { azimuth: az, elevation: Math.max(0, Math.min(90, el)) };
}

/**
 * Detections (in image px of a w x h image) -> camera view, or null.
 * focalHint: a focal length (px) from earlier frames, used when this frame's
 * estimate is degenerate.
 */
export function estimateView(detections, index, board, w, h, focalHint = null) {
  const matched = matchDetections(detections, index);
  const bySheet = new Map();
  for (const d of matched) {
    const sheet = index.get(d.id).sheet;
    if (!bySheet.has(sheet)) bySheet.set(sheet, []);
    bySheet.get(sheet).push(d);
  }
  const ranked = [...bySheet.entries()].sort((a, b) => b[1].length - a[1].length);
  const result = { markers: matched.length, sheets: Object.fromEntries([...bySheet].map(([k, v]) => [k, v.length])) };
  if (!ranked.length || ranked[0][1].length < 2) return { ...result, view: null };

  const [sheet, ms] = ranked[0];
  const plane = [], image = [];
  for (const d of ms) {
    index.get(d.id).corners.forEach((p, i) => {
      plane.push(p);
      image.push([d.corners[i][0] - w / 2, d.corners[i][1] - h / 2]); // centre on principal point
    });
  }
  const Hc = homography(plane, image);
  if (!Hc) return { ...result, view: null };
  let rms = 0;
  plane.forEach((p, i) => {
    const [u, v] = project(Hc, p);
    rms += (u - image[i][0]) ** 2 + (v - image[i][1]) ** 2;
  });
  rms = Math.sqrt(rms / plane.length);
  const maxDim = Math.max(w, h);
  if (rms > 0.01 * maxDim) return { ...result, view: null, rms };

  const focalMeasured = focalFromHomography(Hc, maxDim);
  const focal = focalMeasured ?? focalHint ?? 0.8 * maxDim;
  const pose = poseFromHomography(Hc, focal);
  if (pose.C[2] <= 0) return { ...result, view: null, rms };
  return {
    ...result, sheet, rms, focal, focalMeasured,
    camera: pose.C, view: viewFromCamera(pose.C, board.foot_center_mm),
  };
}

// ---- synthetic camera (tests and the simulated scene) ----------------------

/** Camera at mat position C looking at target, focal f px, image w x h. Returns a projector. */
export function lookAtCamera(C, target, f, w, h) {
  const fwd = sub(target, C);
  const z = scale(fwd, 1 / norm(fwd));
  let x = cross(z, [0, 0, 1]);
  if (norm(x) < 1e-6) x = [1, 0, 0];
  x = scale(x, 1 / norm(x));
  const y = cross(z, x);
  return (P) => {
    const d = sub(P, C);
    const zc = dot(z, d);
    return zc <= 1 ? null : [f * dot(x, d) / zc + w / 2, f * dot(y, d) / zc + h / 2];
  };
}

export function cameraAt(azimuth, elevation, distance, footCenter) {
  const a = azimuth / DEG, e = elevation / DEG;
  const horiz = distance * Math.cos(e);
  return [footCenter[0] + horiz * Math.sin(a), footCenter[1] - horiz * Math.cos(a), distance * Math.sin(e)];
}
