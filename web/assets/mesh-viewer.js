// A small WebGL2 viewer for one scanned surface: orbit, zoom, pan, click to pick a point.
//
// Drag to turn (one finger or the mouse), scroll or pinch to zoom, drag with
// two fingers / right button / shift to slide. A click that doesn't move
// reports the exact point of the surface under it (onPick). Double-click
// re-centres the turning on that point.
import {
  anglesFor, bounds, intersectMesh, lookAt, mat4Multiply, orbitEye, perspective, pixelRay, projectToScreen,
  vertexNormals,
} from "./viewer-math.js";

const FOV = (40 * Math.PI) / 180;

const VS = `#version 300 es
in vec3 aPos; in vec3 aNormal; in vec3 aColor;
uniform mat4 uViewProj; uniform mat4 uView;
out vec3 vNormal; out vec3 vColor;
void main() {
  vNormal = mat3(uView) * aNormal;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;
// Light from the camera (a head-lamp) plus a soft ambient term; both sides lit
// so the inside of an open scan is still readable.
const FS = `#version 300 es
precision mediump float;
in vec3 vNormal; in vec3 vColor;
uniform float uUseColor;
out vec4 frag;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = abs(n.z);
  vec3 base = mix(vec3(0.82, 0.79, 0.74), vColor, uUseColor);
  frag = vec4(base * (0.35 + 0.75 * lambert), 1.0);
}`;
const PVS = `#version 300 es
in vec3 aPos; in vec3 aColor;
uniform mat4 uViewProj; uniform float uSize; uniform vec3 uEye; uniform float uLift;
out vec3 vColor;
void main() {
  // Lift the dot a little toward the camera so the surface it sits on doesn't
  // hide it, while anything genuinely in front of it still does.
  vec3 p = aPos + normalize(uEye - aPos) * uLift;
  gl_Position = uViewProj * vec4(p, 1.0); gl_PointSize = uSize; vColor = aColor;
}`;
const PFS = `#version 300 es
precision mediump float;
in vec3 vColor; out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  if (r > 0.5) discard;
  frag = vec4(r > 0.36 ? vec3(1.0) : vColor, 1.0);  // coloured dot with a white ring
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export class MeshViewer {
  constructor(canvas, { onPick, onChange } = {}) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.onChange = onChange;
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) throw new Error("This browser can't show 3-D (WebGL2 is off or unsupported).");
    this.gl = gl;
    this.prog = program(gl, VS, FS);
    this.pprog = program(gl, PVS, PFS);
    this.basis = { east: [1, 0, 0], north: [0, 1, 0], up: [0, 0, 1] };
    this.cam = { target: [0, 0, 0], yaw: -Math.PI / 2, pitch: 0.5, distance: 400 };
    this.useColor = true;
    this.markers = [];
    this.pointers = new Map();
    this.bindInput();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  load({ positions, colors, indices }) {
    const gl = this.gl;
    this.positions = positions;
    this.indices = indices;
    this.colors = colors;
    const normals = vertexNormals(positions, indices);
    const cols = new Float32Array(positions.length);
    if (colors) for (let i = 0; i < cols.length; i++) cols[i] = colors[i] / 255;
    else cols.fill(0.8);
    this.hasColor = !!colors;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    for (const [name, data] of [["aPos", positions], ["aNormal", normals], ["aColor", cols]]) {
      const loc = gl.getAttribLocation(this.prog, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = indices.length;
    this.bounds = bounds(positions);
    this.home();
  }

  /** Scene axes: {east, north, up}. Views ("medial", ...) are directions in it. */
  setBasis(basis) {
    this.basis = basis;
    this.draw();
  }

  home() {
    const b = this.bounds;
    if (!b) return;
    this.cam.target = b.center.slice();
    this.cam.distance = b.size * 1.6;
    this.draw();
  }

  /** Look from a direction (unit vector from the target toward the eye). */
  lookFrom(direction) {
    const a = anglesFor(direction, this.basis);
    Object.assign(this.cam, a);
    this.cam.pitch = Math.max(-1.55, Math.min(1.55, this.cam.pitch));
    this.draw();
  }

  setMarkers(markers) {
    this.markers = markers; // [{position: [x,y,z], color: [r,g,b] 0-1, label}]
    this.draw();
  }

  eye() {
    return orbitEye(this.cam, this.basis);
  }

  matrices() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const near = Math.max(0.5, this.cam.distance / 200), far = this.cam.distance * 20 + (this.bounds?.size ?? 1000) * 4;
    const view = lookAt(this.eye(), this.cam.target, this.basis.up);
    return { w, h, view, viewProj: mat4Multiply(perspective(FOV, w / h, near, far), view) };
  }

  /** Screen position of a world point (for HTML labels), or null if behind the camera. */
  toScreen(p) {
    const { w, h, viewProj } = this.matrices();
    return projectToScreen(p, viewProj, w, h);
  }

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.render();
    });
  }

  render() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.vao) return;
    gl.enable(gl.DEPTH_TEST);
    const { view, viewProj } = this.matrices();
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, "uViewProj"), false, new Float32Array(viewProj));
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, "uView"), false, new Float32Array(view));
    gl.uniform1f(gl.getUniformLocation(this.prog, "uUseColor"), this.useColor && this.hasColor ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    if (this.markers.length) {
      gl.useProgram(this.pprog);
      const pos = new Float32Array(this.markers.flatMap((m) => m.position));
      const col = new Float32Array(this.markers.flatMap((m) => m.color));
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bufs = [];
      for (const [name, data] of [["aPos", pos], ["aColor", col]]) {
        const loc = gl.getAttribLocation(this.pprog, name);
        const b = gl.createBuffer();
        bufs.push(b);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      }
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pprog, "uViewProj"), false, new Float32Array(viewProj));
      gl.uniform1f(gl.getUniformLocation(this.pprog, "uSize"), 16 * dpr);
      gl.uniform3fv(gl.getUniformLocation(this.pprog, "uEye"), new Float32Array(this.eye()));
      gl.uniform1f(gl.getUniformLocation(this.pprog, "uLift"), 1.5);
      gl.drawArrays(gl.POINTS, 0, this.markers.length);
      // Which dots are actually on screen (not hidden behind the foot): read
      // the pixel at each dot's centre right after drawing and compare colours.
      const px = new Uint8Array(4);
      for (const m of this.markers) {
        const s = projectToScreen(m.position, viewProj, c.clientWidth, c.clientHeight);
        m.visible = false;
        if (!s) continue;
        const x = Math.round(s[0] * dpr), y = Math.round(H - s[1] * dpr);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        m.visible = m.color.every((v, i) => Math.abs(px[i] / 255 - v) < 0.06);
      }
      gl.bindVertexArray(null);
      bufs.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
    }
    this.onChange?.();
  }

  pick(px, py) {
    if (!this.positions) return null;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const ray = pixelRay(px, py, w, h, this.eye(), this.cam.target, this.basis.up, FOV);
    return intersectMesh(this.positions, this.indices, ray.origin, ray.dir);
  }

  // ---- input ----------------------------------------------------------------
  bindInput() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(),
        pan: e.button === 2 || e.shiftKey });
    });
    c.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0) this.zoom(before / after);
        this.pan(dx / 2, dy / 2);
      } else {
        p.x = e.clientX; p.y = e.clientY;
        if (p.pan) this.pan(dx, dy);
        else {
          this.cam.yaw -= dx * 0.008;
          this.cam.pitch = Math.max(-1.55, Math.min(1.55, this.cam.pitch + dy * 0.008));
        }
      }
      this.draw();
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p || this.pointers.size) return;
      const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (e.type === "pointerup" && moved < 6 && performance.now() - p.t0 < 600) {
        const r = c.getBoundingClientRect();
        const hit = this.pick(e.clientX - r.left, e.clientY - r.top);
        const now = performance.now();
        if (hit && this.lastClick && now - this.lastClick < 350) {
          this.cam.target = hit.point; // double-click: turn around this point
          this.draw();
        } else if (hit) this.onPick?.(hit.point);
        this.lastClick = now;
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0015));
      this.draw();
    }, { passive: false });
  }

  zoom(f) {
    const s = this.bounds?.size ?? 300;
    this.cam.distance = Math.max(s * 0.08, Math.min(s * 8, this.cam.distance * f));
  }

  pan(dx, dy) {
    const eye = this.eye();
    const z = [0, 1, 2].map((i) => eye[i] - this.cam.target[i]);
    const zl = Math.hypot(...z);
    const up = this.basis.up;
    let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
    const xl = Math.hypot(...x) || 1;
    x = x.map((v) => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]].map((v) => v / zl);
    const k = (2 * this.cam.distance * Math.tan(FOV / 2)) / this.canvas.clientHeight;
    this.cam.target = this.cam.target.map((t, i) => t - (dx * x[i] - dy * y[i]) * k);
  }
}
