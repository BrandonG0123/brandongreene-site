/**
 * The hero: a gyroid lattice, raymarched in a single fragment shader.
 *
 * A gyroid is a triply periodic minimal surface,
 *   sin x cos y + sin y cos z + sin z cos x = 0,
 * the lattice used as infill inside 3D-printed parts. It is a real equation,
 * so it decorates without claiming anything.
 *
 * Raw WebGL rather than a 3D library: one full-screen triangle and one shader,
 * a few KB instead of ~170 KB.
 *
 * Quality: rendered at full device resolution with glossy glass lighting —
 * key + rim + fill lights, specular highlights, ambient occlusion, iridescent
 * fresnel edges, volumetric glow, ACES tone mapping, and dithering so the glow
 * never bands on the dark ground.
 *
 * Rules this file obeys:
 *  - Software-rendered WebGL is refused (failIfMajorPerformanceCaveat). Those
 *    visitors get a pre-rendered still instead of a stuttering animation —
 *    and so does headless Chrome, which is why Lighthouse stays fast.
 *  - prefers-reduced-motion: one still frame, never animated, pointer ignored.
 *  - A visible pause control (WCAG 2.2.2), remembered across visits.
 *  - Stops rendering when off-screen or the tab is hidden.
 *  - Adaptive resolution: steps down if frames run slow, back up if there's room.
 *  - Shaders compile in parallel where supported, and the whole thing starts
 *    after the page has loaded, so the headline never waits on the GPU.
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
  p.xz *= rot(uTime * 0.07 + uMouse.x * 0.55);
  p.yz *= rot(uTime * 0.045 - uMouse.y * 0.40 + 0.35);
  return p;
}

float gyroid(vec3 q, float s, float thick) {
  vec3 r = q * s;
  return abs(dot(sin(r), cos(r.zxy))) / s - thick;
}

float map(vec3 p) {
  vec3 q = orient(p);
  float breathe = 0.5 + 0.5 * sin(uTime * 0.38);
  float sphere = length(q) - (1.0 - uScroll * 0.9);
  float g = gyroid(q, 7.2, 0.011 + 0.008 * breathe);
  // The gyroid's field is not a true distance, so march conservatively.
  return max(sphere, g * 0.5);
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0006;
  return normalize(
    k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
    k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.008 + 0.05 * float(i) / 4.0;
    occ += (h - map(p + h * n)) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 4.0 * occ, 0.0, 1.0);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv.x -= uOffset;
  uv.y += 0.05;

  vec3 ro = vec3(0.0, 0.0, 3.7);
  vec3 rd = normalize(vec3(uv, -1.65));

  // The ball: one optic-yellow point that drops out of the lattice as the
  // reader scrolls, and becomes the toss in the serve below.
  vec3 ballPos = vec3(0.0, -uScroll * 3.4, 0.0);
  float ballOn = smoothstep(0.04, 0.16, uScroll);

  // Skip empty space: only march rays that can hit the bounding sphere.
  float t = 0.0, glow = 0.0, ballGlow = 0.0, hit = 0.0;
  float b = dot(ro, rd), c = dot(ro, ro) - 1.08 * 1.08, disc = b * b - c;
  vec3 p = ro;
  float tEnd = 7.5;
  if (disc > 0.0) {
    t = max(0.0, -b - sqrt(disc));
    tEnd = -b + sqrt(disc);
  } else {
    t = tEnd; // miss: only the ball and the background
  }

  for (int i = 0; i < 150; i++) {
    if (t >= tEnd) break;
    p = ro + rd * t;
    float d = map(p);
    float db = length(p - ballPos) - 0.055;
    glow += exp(-max(d, 0.0) * 22.0) * 0.011;
    ballGlow += exp(-max(db, 0.0) * 34.0) * 0.05;
    if (d < 0.0004 * t) { hit = 1.0; break; }
    t += min(d, db + 0.02);
  }

  // The ball can be outside the sphere; give it its own cheap glow pass.
  if (ballOn > 0.0) {
    vec3 oc = ro - ballPos;
    float bb = dot(oc, rd);
    float closest = length(oc - rd * bb);
    ballGlow = max(ballGlow, exp(-closest * 26.0) * 1.4);
  }

  vec3 col = uBg;

  if (hit > 0.5) {
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    float ndv = max(dot(n, v), 0.0);
    float fres = pow(1.0 - ndv, 3.0);
    float ao = calcAO(p, n);

    vec3 key = normalize(vec3(0.6, 0.85, 0.45));
    vec3 rim = normalize(vec3(-0.75, -0.15, 0.55));
    float dif = max(dot(n, key), 0.0);
    float spec = pow(max(dot(n, normalize(key + v)), 0.0), 220.0);
    float spec2 = pow(max(dot(n, normalize(rim + v)), 0.0), 36.0);

    if (uLight > 0.5) {
      // Reading mode: graphite linework on paper, like a pencil drawing.
      vec3 ink = mix(uBg, uInk, 0.14 + fres * 0.8);
      col = mix(uBg, ink, ao) - spec * 0.05;
    } else {
      vec3 body = mix(uViolet * 0.10, uViolet * 0.42, dif) * (0.55 + 0.45 * ao);
      vec3 iri = 0.5 + 0.5 * cos(6.2831 * (fres * 0.85 + vec3(0.0, 0.33, 0.67)) + uTime * 0.09);
      // Glossy glass comes from reflecting a soft studio environment, not from
      // point highlights: the lattice is so regular that point specular lands
      // on every saddle at once and reads as polka dots.
      vec3 rf = reflect(rd, n);
      float sky = smoothstep(-0.2, 0.9, rf.y);
      float softbox = pow(max(rf.y * 0.7 + rf.x * 0.3, 0.0), 6.0);
      vec3 env = uIce * sky * 0.35 + vec3(1.0) * softbox * 0.9;
      vec3 lit = body
        + uIce * fres * 1.2 * ao
        + iri * fres * 0.28
        + env * (0.15 + 0.85 * fres) * ao
        + vec3(1.0) * spec * 0.25
        + uIce * spec2 * 0.1;
      // depth: farther lattice sits back in the haze
      lit *= exp(-0.22 * max(t - 2.6, 0.0));
      col = aces(lit * 1.15);
    }
  }

  if (uLight < 0.5) {
    col += aces(glow * mix(uViolet, uIce, 0.62) * 1.2);
    col += ballGlow * ballOn * uBall;
  } else {
    col = mix(col, uInk, clamp(glow * 0.3, 0.0, 0.22));
    col = mix(col, uBall, clamp(ballGlow * ballOn, 0.0, 1.0));
  }

  // Keep the text side calm: vignette toward the left and edges.
  float vig = smoothstep(1.15, 0.2, length(uv * vec2(0.9, 1.0)));
  col = mix(uBg, col, vig * uDim);

  // Dither: kills banding in the soft glow on a near-black ground.
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

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

  const fallback = () => {
    section.classList.add('hero--no-webgl');
    pauseBtn?.remove();
  };

  // Refuse software rendering: it would turn every frame into a long task.
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return fallback();

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  // With KHR_parallel_shader_compile the link happens off the main thread;
  // poll for completion instead of blocking on it.
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const ready = () =>
    new Promise<void>((resolve) => {
      if (!parallel) return resolve();
      const check = () =>
        gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR) ? resolve() : requestAnimationFrame(check);
      check();
    });

  ready().then(() => {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('gyroid: shader failed', gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog));
      return fallback();
    }
    start(gl, prog);
  });

  function start(gl: WebGLRenderingContext, prog: WebGLProgram) {
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
      gl.uniform1f(u.light, document.documentElement.dataset.theme === 'light' ? 1 : 0);
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

    // Start at full device resolution; adapt down if the GPU can't keep up.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const narrow = matchMedia('(max-width: 40rem)').matches;
    const MAX_SCALE = narrow ? dpr * 0.75 : dpr;
    const MIN_SCALE = 0.35;
    let scale = MAX_SCALE;

    let w = 0, h = 0;
    const resize = () => {
      const r = canvas!.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * scale));
      h = Math.max(1, Math.round(r.height * scale));
      canvas!.width = w;
      canvas!.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
      const wide = r.width / r.height > 1.15;
      gl.uniform1f(u.offset, wide ? 0.58 : 0.0);
      gl.uniform1f(u.dim, wide ? 1.0 : 0.45);
    };

    let mouseTarget = [0, 0];
    const mouse = [0, 0];
    window.addEventListener('pointermove', (e) => {
      if (reduced.matches) return;
      mouseTarget = [(e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1];
    }, { passive: true });

    let scrollP = 0;
    const readScroll = () => {
      const r = section.getBoundingClientRect();
      scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
    };

    let time = 7.0;
    let last = performance.now();
    let raf = 0, visible = true;
    let frames = 0, acc = 0, goodWindows = 0;

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
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += Math.min(dt, 0.05);
      draw();

      // Adapt every 40 frames: down fast if slow, up cautiously if there's room.
      acc += dt; frames++;
      if (frames === 40) {
        const avg = acc / frames;
        if (avg > 1 / 50 && scale > MIN_SCALE) {
          scale = Math.max(MIN_SCALE, scale * 0.8); resize(); goodWindows = 0;
        } else if (avg < 1 / 58 && scale < MAX_SCALE) {
          if (++goodWindows >= 3) { scale = Math.min(MAX_SCALE, scale * 1.1); resize(); goodWindows = 0; }
        } else goodWindows = 0;
        frames = 0; acc = 0;
      }
      raf = animating() ? requestAnimationFrame(loop) : 0;
    };

    const play = () => {
      if (raf) return;
      if (!animating()) { draw(); return; }
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
      userPaused ? stop() : play();
    });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible ? play() : stop();
    }).observe(section);

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
    reduced.addEventListener('change', () => { syncButton(); reduced.matches ? (stop(), draw()) : play(); });
    window.addEventListener('scroll', () => { readScroll(); if (!raf) draw(); }, { passive: true });
    window.addEventListener('resize', () => { resize(); if (!raf) draw(); });
    window.addEventListener('themechange', () => { setColours(); if (!raf) draw(); });

    resize();
    readScroll();
    syncButton();
    section.classList.add('hero--ready');
    play();
  }
}
