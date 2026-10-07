/**
 * The hero: a gyroid lattice, raymarched in a single fragment shader.
 *
 * A gyroid is a triply periodic minimal surface,
 *   sin x cos y + sin y cos z + sin z cos x = 0,
 * the lattice used as infill inside 3D-printed parts. It is a real equation,
 * so it decorates without claiming anything.
 *
 * Raw WebGL rather than a 3D library: it is one full-screen quad and one shader,
 * so it costs a few KB instead of ~170 KB.
 *
 * Accessibility and performance rules this file obeys:
 *  - prefers-reduced-motion: render ONE still frame, never animate, ignore pointer
 *  - a visible pause control (WCAG 2.2.2), remembered across visits
 *  - stops rendering when off-screen or when the tab is hidden
 *  - adaptive resolution: drops render scale if frames run slow, so phones keep up
 *  - initialises after first paint, so the headline is never waiting on the GPU
 */

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform float uScroll;
uniform float uOffset;
uniform float uDim;
uniform float uLight;
uniform vec3  uIce;
uniform vec3  uViolet;
uniform vec3  uBall;
uniform vec3  uBg;
uniform vec3  uInk;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 orient(vec3 p) {
  p.xz *= rot(uTime * 0.11 + uMouse.x * 0.55);
  p.yz *= rot(uTime * 0.07 - uMouse.y * 0.40 + 0.35);
  return p;
}

float gyroid(vec3 p) {
  float breathe = 0.5 + 0.5 * sin(uTime * 0.55);
  float s = 7.2;
  vec3 q = p * s;
  float g = dot(sin(q), cos(q.zxy));
  return abs(g) / s - (0.012 + 0.009 * breathe);
}

float map(vec3 p) {
  vec3 q = orient(p);
  // Bound the infinite lattice in a sphere that shrinks as the hero scrolls
  // away, so the object dissolves rather than just sliding off-screen.
  float sphere = length(q) - (1.0 - uScroll * 0.9);
  return max(sphere, gyroid(q) * 0.55);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv.x -= uOffset;
  uv.y += 0.05;

  vec3 ro = vec3(0.0, 0.0, 3.7);
  vec3 rd = normalize(vec3(uv, -1.65));

  // The ball: one optic-yellow point that drops out of the lattice as the reader
  // scrolls, and becomes the toss in the serve below.
  vec3 ballPos = vec3(0.0, -uScroll * 3.4, 0.0);
  float ballOn = smoothstep(0.04, 0.16, uScroll);

  float t = 0.0, glow = 0.0, ballGlow = 0.0, hit = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 110; i++) {
    p = ro + rd * t;
    float d = map(p);
    float db = length(p - ballPos) - 0.055;
    glow += exp(-max(d, 0.0) * 16.0) * 0.018;
    ballGlow += exp(-max(db, 0.0) * 34.0) * 0.06;
    if (d < 0.0015) { hit = 1.0; break; }
    t += min(d, db + 0.02);
    if (t > 7.5) break;
  }

  vec3 col = uBg;

  if (hit > 0.5) {
    vec3 n = normalAt(p);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
    float diff = max(dot(n, normalize(vec3(0.55, 0.85, 0.45))), 0.0);
    if (uLight > 0.5) {
      // Reading mode: graphite linework on paper, like a pencil drawing.
      col = mix(uBg, uInk, 0.18 + fres * 0.75);
    } else {
      vec3 base = mix(uViolet * 0.22, uIce * 0.85, fres);
      vec3 iri = 0.5 + 0.5 * cos(6.2831 * (fres * 0.7 + vec3(0.0, 0.33, 0.67)));
      col = base + diff * 0.16 * uIce + iri * fres * 0.22;
    }
  }

  if (uLight < 0.5) {
    col += glow * mix(uViolet, uIce, 0.65);
    col += ballGlow * ballOn * uBall;
  } else {
    col = mix(col, uInk, clamp(glow * 0.35, 0.0, 0.25));
    col = mix(col, uBall, clamp(ballGlow * ballOn, 0.0, 1.0));
  }

  // Keep the text side calm: vignette toward the left and edges.
  float vig = smoothstep(1.15, 0.2, length(uv * vec2(0.9, 1.0)));
  col = mix(uBg, col, vig * uDim);

  gl_FragColor = vec4(col, 1.0);
}
`;

const hex = (h: string): [number, number, number] => {
  const v = h.trim().replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
};

export function initGyroid(section: HTMLElement) {
  const canvas = section.querySelector<HTMLCanvasElement>('[data-gyroid]');
  const pauseBtn = section.querySelector<HTMLButtonElement>('[data-motion-toggle]');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) {
    section.classList.add('hero--no-webgl');
    pauseBtn?.remove();
    return;
  }

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };

  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
  } catch (e) {
    console.warn('gyroid: shader failed, falling back to still background', e);
    section.classList.add('hero--no-webgl');
    pauseBtn?.remove();
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = {
    res: U('uRes'), time: U('uTime'), mouse: U('uMouse'), scroll: U('uScroll'),
    offset: U('uOffset'), dim: U('uDim'), light: U('uLight'),
    ice: U('uIce'), violet: U('uViolet'), ball: U('uBall'), bg: U('uBg'), ink: U('uInk'),
  };

  const setColours = () => {
    const cs = getComputedStyle(document.documentElement);
    const light = document.documentElement.dataset.theme === 'light';
    gl.uniform1f(u.light, light ? 1 : 0);
    gl.uniform3fv(u.ice, hex(cs.getPropertyValue('--ice') || '#4DF3FF'));
    gl.uniform3fv(u.violet, hex(cs.getPropertyValue('--violet') || '#8B5CFF'));
    gl.uniform3fv(u.ball, hex(cs.getPropertyValue('--ball') || '#D4FF3A'));
    gl.uniform3fv(u.bg, hex(cs.getPropertyValue('--bg') || '#05060A'));
    gl.uniform3fv(u.ink, hex(cs.getPropertyValue('--fg') || '#1A1C1E'));
  };
  setColours();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false;
  try { userPaused = localStorage.getItem('motion') === 'paused'; } catch { /* storage blocked */ }

  // Render scale adapts to the device: start conservative, step down if slow.
  let scale = Math.min(window.devicePixelRatio || 1, 1.5) * (matchMedia('(max-width: 40rem)').matches ? 0.5 : 0.62);
  const MIN_SCALE = 0.3;

  let w = 0, h = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * scale));
    h = Math.max(1, Math.round(r.height * scale));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
    // Wide screens: object sits right of the headline. Narrow: centred and dimmed.
    const wide = r.width / r.height > 1.15;
    gl.uniform1f(u.offset, wide ? 0.58 : 0.0);
    gl.uniform1f(u.dim, wide ? 1.0 : 0.45);
  };

  let mouseTarget = [0, 0], mouse = [0, 0];
  const onPointer = (e: PointerEvent) => {
    if (reduced.matches) return;
    mouseTarget = [(e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1];
  };

  let scrollP = 0;
  const readScroll = () => {
    const r = section.getBoundingClientRect();
    scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
  };

  let time = 7.0;           // start at a flattering angle
  let last = performance.now();
  let raf = 0, visible = true, frames = 0, slowAcc = 0;

  const draw = () => {
    mouse[0] += (mouseTarget[0] - mouse[0]) * 0.05;
    mouse[1] += (mouseTarget[1] - mouse[1]) * 0.05;
    gl.uniform1f(u.time, time);
    gl.uniform2f(u.mouse, mouse[0], mouse[1]);
    gl.uniform1f(u.scroll, scrollP);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const animating = () => !reduced.matches && !userPaused && visible && !document.hidden;

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    draw();

    // Adaptive quality: average frame cost over 40 frames.
    slowAcc += dt; frames++;
    if (frames === 40) {
      const avg = slowAcc / frames;
      if (avg > 1 / 45 && scale > MIN_SCALE) { scale *= 0.82; resize(); }
      frames = 0; slowAcc = 0;
    }

    raf = animating() ? requestAnimationFrame(loop) : 0;
  };

  const start = () => {
    if (raf || !animating()) { if (!animating()) draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  const syncButton = () => {
    if (!pauseBtn) return;
    if (reduced.matches) { pauseBtn.hidden = true; return; }
    pauseBtn.hidden = false;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.textContent = userPaused ? 'Play motion' : 'Pause motion';
  };

  pauseBtn?.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('motion', userPaused ? 'paused' : 'playing'); } catch { /* blocked */ }
    syncButton();
    userPaused ? stop() : start();
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  }).observe(section);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduced.addEventListener('change', () => { syncButton(); reduced.matches ? (stop(), draw()) : start(); });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', () => { readScroll(); if (!raf) draw(); }, { passive: true });
  window.addEventListener('resize', () => { resize(); if (!raf) draw(); });
  window.addEventListener('themechange', () => { setColours(); if (!raf) draw(); });

  resize();
  readScroll();
  syncButton();
  section.classList.add('hero--ready');
  start();
  if (!animating()) draw();
}
