// Simulated camera: renders the real scan mat and a speckled, foot-shaped
// patch in true perspective from a camera circling the foot. It exists so the
// whole capture pipeline (quality checks, marker detection, pose, coverage)
// can be exercised on a laptop. It is not a foot, and frames from it are
// never saved.
//
// It also reports motion-sensor readings with a deliberate 37 degree compass
// offset, the way a real phone's heading has nothing to do with where the
// foot is, so the scanner's sensor-to-mat alignment gets exercised too.
import { cameraAt, lookAtCamera } from "./mat-pose.js";

const SENSOR_OFFSET_DEG = 37;

export class SimulatedCamera {
  constructor(board) {
    this.board = board;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 800;
    this.small = document.createElement("canvas");
    this.small.width = 160;
    this.small.height = 100;
    this.az = 0;
    this.last = null;

    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const [fx, fy] = board.foot_center_mm;
    // Foot-ish outline: narrower at the heel, wider across the forefoot.
    this.outline = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * 2 * Math.PI;
      const y = 125 * Math.sin(t);
      const halfWidth = (y > 30 ? 50 : y < -80 ? 32 : 42) * Math.abs(Math.cos(t)) ** 0.7;
      this.outline.push([fx + Math.sign(Math.cos(t)) * halfWidth, fy + y]);
    }
    this.dots = [];
    while (this.dots.length < 700) {
      const x = fx + (rand() - 0.5) * 100, y = fy + (rand() - 0.5) * 250;
      if (inside(this.outline, x, y)) this.dots.push([x, y, 1.2 + rand() * 2, rand() < 0.5]);
    }
    this.cells = [];
    for (const sheet of board.sheets) {
      const [ox, oy] = sheet.origin_mm;
      for (const [id, rows] of Object.entries(sheet.bits)) {
        const [[x0, yTop]] = sheet.markers[id];
        const c = board.marker_mm / 8;
        rows.forEach((row, r) => [...row].forEach((bit, col) => {
          if (bit === "1") this.cells.push([ox + x0 + col * c, oy + yTop - (r + 1) * c, c]);
        }));
      }
    }
  }

  get elevation() {
    return [15, 40, 70][Math.floor(this.az / 360) % 3] + 4 * Math.sin(this.az / 23);
  }

  /** Fake DeviceOrientation: compass heading is offset from the mat on purpose. */
  orientation() {
    return { alpha: (this.az + SENSOR_OFFSET_DEG) % 360, beta: 90 - this.elevation, gamma: 0 };
  }

  render(now, moving) {
    const dt = this.last == null ? 0 : Math.min(250, now - this.last);
    this.last = now;
    if (moving) this.az += dt * 0.02;
    const { width: W, height: H } = this.canvas;
    const blurry = now % 9000 < 1300, dark = now % 13000 > 11800;
    const [fx, fy] = this.board.foot_center_mm;
    const C = cameraAt(this.az % 360, this.elevation, 620, this.board.foot_center_mm);
    const proj = lookAtCamera(C, [fx, fy, 0], 0.9 * W, W, H);
    const c = this.canvas.getContext("2d");

    const poly = (pts, fill) => {
      const px = pts.map(([x, y]) => proj([x, y, 0]));
      if (px.some((p) => !p)) return;
      c.beginPath();
      px.forEach(([u, v], i) => (i ? c.lineTo(u, v) : c.moveTo(u, v)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
    };

    c.fillStyle = "#8f8a80";
    c.fillRect(0, 0, W, H);
    const [sw, sh] = this.board.sheet_mm;
    for (const sheet of this.board.sheets) {
      const [ox, oy] = sheet.origin_mm;
      poly([[ox, oy], [ox + sw, oy], [ox + sw, oy + sh], [ox, oy + sh]], "#f7f7f2");
    }
    c.beginPath();
    for (const [x, y, s] of this.cells) {
      const px = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map(([a, b]) => proj([a, b, 0]));
      if (px.some((p) => !p)) continue;
      px.forEach(([u, v], i) => (i ? c.lineTo(u, v) : c.moveTo(u, v)));
      c.closePath();
    }
    c.fillStyle = "#111";
    c.fill();

    poly(this.outline, "#d6a283");
    for (const [x, y, r, darkDot] of this.dots) {
      const p = proj([x, y, 0]);
      if (!p) continue;
      const q = proj([x + r, y, 0]);
      c.fillStyle = darkDot ? "#3b2a22" : "#f7e9df";
      c.beginPath();
      c.arc(p[0], p[1], Math.max(0.8, Math.hypot(q[0] - p[0], q[1] - p[1])), 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(0,0,0,0.85)";
    c.font = "600 20px system-ui, sans-serif";
    c.fillText("SIMULATED SCENE: not a real foot", 20, H - 20);

    if (blurry) {
      this.small.getContext("2d").drawImage(this.canvas, 0, 0, this.small.width, this.small.height);
      c.drawImage(this.small, 0, 0, W, H);
    }
    if (dark) {
      c.fillStyle = "rgba(0,0,0,0.82)";
      c.fillRect(0, 0, W, H);
    }
  }
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
