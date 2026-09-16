// Frame quality and coverage logic for the capture page.
// Pure functions, no DOM, so they run under `node --test` too.
//
// Every threshold here is a starting guess. They get tuned against what
// actually reconstructs well in Phase 2, not against how the UI feels.

/** RGBA pixel array -> luma (Rec. 601 weights), one value per pixel. */
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return g;
}

/**
 * Sharpness = variance of the Laplacian.
 *
 * The Laplacian (4*centre - up - down - left - right) is a second derivative:
 * it is large at edges and fine texture and near zero on smooth gradients.
 * Blur removes fine texture, so the Laplacian response flattens and its
 * variance drops. The absolute value depends on the scene (a speckle sock
 * scores far higher than bare skin), which is why SharpnessJudge compares
 * each frame against recent frames rather than a fixed number.
 */
export function laplacianVariance(gray, w, h) {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += l; sumSq += l * l; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function exposureStats(gray) {
  let sum = 0, hi = 0, lo = 0;
  for (const v of gray) {
    sum += v;
    if (v >= 250) hi++;
    if (v <= 8) lo++;
  }
  const n = gray.length || 1;
  return { mean: sum / n, clippedHigh: hi / n, clippedLow: lo / n };
}

export function judgeExposure({ mean, clippedHigh, clippedLow }) {
  if (clippedHigh > 0.05) return { ok: false, issue: "overexposed", message: "Too bright: highlights are clipping. Move out of direct light." };
  if (mean > 215) return { ok: false, issue: "overexposed", message: "Too bright overall." };
  if (clippedLow > 0.25 || mean < 50) return { ok: false, issue: "underexposed", message: "Too dark. Add even, diffuse light." };
  return { ok: true, issue: null, message: "Exposure OK" };
}

export class SharpnessJudge {
  constructor({ window = 40, ratio = 0.55, absoluteMin = 15 } = {}) {
    Object.assign(this, { window, ratio, absoluteMin });
    this.recent = [];
  }

  /** Score relative to the 90th percentile of recent frames. */
  judge(score) {
    this.recent.push(score);
    if (this.recent.length > this.window) this.recent.shift();
    const sorted = [...this.recent].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))];
    const relative = p90 > 0 ? score / p90 : 0;
    const warmingUp = this.recent.length < 8;
    const ok = score >= this.absoluteMin && (warmingUp || relative >= this.ratio);
    return {
      ok, relative, warmingUp,
      message: ok ? "Sharp" : score < this.absoluteMin
        ? "No detail. Is the foot in view and in focus?"
        : "Blurry. Move slower and hold steady.",
    };
  }
}

// ---- coverage ------------------------------------------------------------
//
// Viewing positions around the foot, seen from above: 12 azimuth sectors x
// 2 side bands (low, mid) + 1 overhead cell. Azimuth 0 is where the capture
// started (the protocol says start behind the heel) and increases
// counter-clockwise seen from above.
//
// Until the marker board is detected in each frame, position comes from the
// phone's motion sensors, which drift. Treat the map as guidance, not a
// measurement.

export const AZ_SECTORS = 12;
export const BANDS = [
  { key: "low", label: "low", min: 0, max: 25 },
  { key: "mid", label: "mid", min: 25, max: 60 },
  { key: "top", label: "overhead", min: 60, max: 91 },
];

export function wrap360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * DeviceOrientation -> approximate camera position around the foot.
 * beta is front/back tilt: 90 = phone upright (rear camera looks level),
 * 0 = phone flat (rear camera looks straight down). So camera elevation
 * above the floor is about 90 - |beta|.
 */
export function viewFromOrientation({ alpha, beta }, alpha0) {
  return {
    azimuth: wrap360(alpha - alpha0),
    elevation: Math.max(0, Math.min(90, 90 - Math.abs(beta))),
  };
}

export function cellFor({ azimuth, elevation }) {
  const band = BANDS.findIndex((b) => elevation >= b.min && elevation < b.max);
  if (BANDS[band].key === "top") return "top";
  return `${BANDS[band].key}-${Math.floor(wrap360(azimuth) / (360 / AZ_SECTORS)) % AZ_SECTORS}`;
}

export class Coverage {
  constructor({ perSideCell = 2, topCell = 4 } = {}) {
    this.perSideCell = perSideCell;
    this.topCell = topCell;
    this.counts = new Map();
    for (const b of ["low", "mid"]) for (let i = 0; i < AZ_SECTORS; i++) this.counts.set(`${b}-${i}`, 0);
    this.counts.set("top", 0);
  }

  target(cell) {
    return cell === "top" ? this.topCell : this.perSideCell;
  }

  add(cell) {
    this.counts.set(cell, (this.counts.get(cell) || 0) + 1);
  }

  remove(cell) {
    this.counts.set(cell, Math.max(0, (this.counts.get(cell) || 0) - 1));
  }

  fill(cell) {
    return Math.min(1, this.counts.get(cell) / this.target(cell));
  }

  /** Fraction of the total required frames that are present. */
  completeness() {
    let have = 0, need = 0;
    for (const cell of this.counts.keys()) {
      const t = this.target(cell);
      have += Math.min(t, this.counts.get(cell));
      need += t;
    }
    return have / need;
  }

  missing() {
    return [...this.counts.keys()].filter((c) => this.counts.get(c) < this.target(c));
  }
}

export function describeCell(cell) {
  if (cell === "top") return "from directly above";
  const [band, idx] = cell.split("-");
  const from = Number(idx) * (360 / AZ_SECTORS);
  return `${band} angle, ${from}–${from + 360 / AZ_SECTORS}° around from the start`;
}

/** Nearest under-covered cell to where the camera is now. */
export function nextMissing(coverage, view) {
  const missing = coverage.missing();
  if (!missing.length) return null;
  const here = view ? cellFor(view) : null;
  if (here && missing.includes(here)) return here;
  if (!view) return missing[0];
  const dist = (cell) => {
    if (cell === "top") return Math.max(0, 60 - view.elevation) * 2;
    const [band, idx] = cell.split("-");
    const centre = (Number(idx) + 0.5) * (360 / AZ_SECTORS);
    const d = Math.abs(((centre - view.azimuth + 540) % 360) - 180);
    const bandCentre = band === "low" ? 12 : 42;
    return d + Math.abs(bandCentre - view.elevation);
  };
  return missing.sort((a, b) => dist(a) - dist(b))[0];
}

/**
 * Decide whether to keep the current frame.
 * Keeps frames that are sharp and well exposed, at most one per minInterval,
 * and stops piling frames into a cell that is already well covered.
 */
export function shouldCapture({ sharpOk, exposureOk, now, lastCaptureAt, cell, coverage, maxPerCell = 6, minIntervalMs = 600 }) {
  if (!sharpOk || !exposureOk) return false;
  if (now - lastCaptureAt < minIntervalMs) return false;
  if (cell && coverage.counts.get(cell) >= maxPerCell) return false;
  return true;
}
