// Simulated camera: a synthetic test scene for trying the scan flow without a
// phone. It rotates a speckled foot shape as if you were walking around it and
// deliberately blurs and darkens now and then so the warnings fire.
// Frames from it are never saved.
import { FOOT_PATH, TOES } from "./layout.js";

export class SimulatedCamera {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 800;
    this.small = document.createElement("canvas");
    this.small.width = 160;
    this.small.height = 100;
    this.path = new Path2D(FOOT_PATH);
    TOES.forEach(([x, y, r]) => this.path.arc(x, y, r, 0, Math.PI * 2));
    const probe = document.createElement("canvas").getContext("2d");
    this.dots = [];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (this.dots.length < 900) {
      const x = rand() * 200, y = rand() * 200;
      if (probe.isPointInPath(this.path, x, y)) this.dots.push([x, y, 0.6 + rand() * 1.6, rand() < 0.5]);
    }
    this.az = 0;
    this.last = null;
  }

  orientation() {
    const lap = Math.floor(this.az / 360) % 3;
    const elevation = [12, 42, 75][lap] + 5 * Math.sin(this.az / 20);
    return { alpha: this.az % 360, beta: 90 - elevation, gamma: 0 };
  }

  render(now, moving) {
    const dt = this.last == null ? 0 : Math.min(250, now - this.last);
    this.last = now;
    if (moving) this.az += dt * 0.024;
    const elevation = 90 - this.orientation().beta;
    const blurry = now % 9000 < 1300, dark = now % 13000 > 11800;

    const c = this.canvas.getContext("2d");
    const { width: W, height: H } = this.canvas;
    c.save();
    c.fillStyle = "#cfd3cc";
    c.fillRect(0, 0, W, H);
    const squash = 0.25 + 0.75 * Math.sin((Math.max(elevation, 5) * Math.PI) / 180);
    c.translate(W / 2, H / 2);
    c.scale(1, squash);
    c.rotate((-this.az * Math.PI) / 180);
    const sq = 44;
    for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) {
      c.fillStyle = (i + j) & 1 ? "#1c1f1e" : "#f4f4f0";
      c.fillRect(i * sq, j * sq, sq, sq);
    }
    c.scale(2.6, 2.6);
    c.translate(-100, -105);
    c.fillStyle = "#d9a98c";
    c.fill(this.path);
    for (const [x, y, r, darkDot] of this.dots) {
      c.fillStyle = darkDot ? "#3b2a22" : "#f7e9df";
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.fillStyle = "rgba(0,0,0,0.9)";
    c.font = "600 22px system-ui, sans-serif";
    c.fillText("SIMULATED SCENE: not a real foot", 24, H - 24);
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
