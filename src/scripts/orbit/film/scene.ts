/**
 * The opening film, as a scene that renders any moment from the score clock.
 * video/ renders it frame by frame into the opening videos; nothing here ships
 * in the page's own bundle.
 *
 *   0.0–1.1   flight: the ball, just hit, in slow motion. It opens on the
 *             ball's backlit edge, felt fibres still drifting off it from the
 *             hit, and pulls back as it flies through dust in the light
 *   1.1–2.7   ignition: the trailing side catches; flames stream back; the
 *             ball slows to rest at the centre and the camera settles on it
 *   2.7–3.75  scan: a line climbs the burning ball; below it the felt is gone
 *             (the live scene draws the points there, on this same camera)
 *
 * From 2.6 s the camera is exactly the live scene's close-up (layout.ts), so
 * the page can hand over without a seam.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { rng } from '../util';
import { BALL_R, FOV, closeDistance } from '../layout';
import { orientationAt, scanY } from '../ball';
import { SCORE, ramp, easeInOut, smooth, clamp01 } from '../score';
import { feltBall } from './felt';
import { createFire } from './fire';

const ARRIVE = SCORE.ignition[1];          // the ball comes to rest at the centre
const SETTLED = ARRIVE - 0.1;              // the camera is the live close-up from here
const IGNITE = SCORE.ignition[0];
const P0 = new THREE.Vector3(-2.9, -1.05, -1.4);
const MACRO_END = 0.8;                     // the opening macro has pulled back by here

/** Where the ball is: decelerating from P0 to rest at the origin. */
export function ballAt(t: number, out = new THREE.Vector3()) {
  const u = Math.min(1, Math.max(0, t / ARRIVE));
  return out.copy(P0).multiplyScalar(Math.pow(1 - u, 2.4));
}
function velocityAt(t: number, out = new THREE.Vector3()) {
  const u = Math.min(1, Math.max(0, t / ARRIVE));
  return out.copy(P0).multiplyScalar((-2.4 / ARRIVE) * Math.pow(1 - u, 1.4));
}

// Light: a cold rim from behind and above right (the macro looks along the
// edge it catches), a warm key from the front left (the live scene's key
// side), a breath of the site's violet in the shadows, and the fire's own.
const RIM_DIR = new THREE.Vector3(2.2, 1.8, -5.4).normalize();
const KEY_DIR = new THREE.Vector3(-2.6, 2.3, 2.2).normalize();

const lerp = THREE.MathUtils.lerp;
const EDGE = new THREE.Vector3(0.6, 0.8, 0);
const _pos = new THREE.Vector3(), _view = new THREE.Vector3(), _limb = new THREE.Vector3(), _target = new THREE.Vector3();

/**
 * The film's camera at time t. It opens on the ball's upper-right edge, where
 * the rim light catches the fuzz against black; pulls back to find the ball
 * low on the left, in flight, and lets it glide into the centre as it slows,
 * dollying in and swinging round to end dead on the live close-up. One smooth
 * move: the ball never jumps across the frame.
 */
export function filmCamera(t: number, aspect: number, camera: THREE.PerspectiveCamera) {
  const near = closeDistance(aspect);
  if (t >= SETTLED) {
    camera.fov = FOV;
    camera.position.set(0, 0, near);
    camera.lookAt(0, 0, 0);
  } else {
    const pull = easeInOut(clamp01(t / MACRO_END));
    const k = easeInOut(clamp01(t / SETTLED));
    const k2 = easeInOut(clamp01((t - MACRO_END * 0.6) / (SETTLED - MACRO_END * 0.6)));
    ballAt(t, _pos);
    const az = lerp(0.42, 0, k), el = lerp(-0.1, 0, k);
    _view.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // The limb: the ball's upper-right edge as seen from the camera.
    _limb.copy(EDGE).addScaledVector(_view, -EDGE.dot(_view)).normalize().multiplyScalar(BALL_R * 1.012).add(_pos);
    // After the macro, look ahead of the ball, along its flight to the centre
    // (less on a tall frame, which has less room either side).
    const tall = aspect < 1;
    _target.copy(_pos).multiplyScalar((tall ? 0.78 : 0.5) * (1 - k2)).lerp(_limb, 1 - pull);
    const dist = lerp(lerp(tall ? 2 : 1.45, tall ? 10.2 : 6.6, pull), near, k2);
    camera.fov = lerp(lerp(15, 21, pull), FOV, k2);
    camera.position.copy(_target).addScaledVector(_view, dist);
    camera.lookAt(_target);
  }
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

export interface Film {
  render(t: number): void;
  dispose(): void;
}

export function createFilm(canvas: HTMLCanvasElement, W: number, H: number, dpr = 1): Film {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060A');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.08;
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 100);

  const rim = new THREE.DirectionalLight('#e2f5ff', 4.2);
  rim.position.copy(RIM_DIR).multiplyScalar(5);
  const key = new THREE.DirectionalLight('#fff1e0', 1.55);
  key.position.copy(KEY_DIR).multiplyScalar(5);
  const fill = new THREE.DirectionalLight('#8B5CFF', 0.35);
  fill.position.set(2, -1.6, 2.2);
  const fireLight = new THREE.PointLight('#ff7a22', 0, 3.5, 1.6);
  const fireLight2 = new THREE.PointLight('#ffb050', 0, 2.5, 1.6);
  scene.add(rim, key, fill, fireLight, fireLight2);

  const ball = feltBall(BALL_R);
  scene.add(ball.group);

  // The burn starts round the back of the ball at the moment of ignition,
  // fixed to the felt: as the ball turns it brings the char round onto the
  // left side, so flames stream off the silhouette rather than out of a crater
  // facing the camera.
  const ignLocal = new THREE.Vector3(0.45, 0.05, -0.9).normalize().applyQuaternion(orientationAt(IGNITE).invert());
  ball.uniforms.uIgn.value.copy(ignLocal);

  const fire = createFire(Math.round(W * dpr * 0.5), Math.round(H * dpr * 0.5));
  fire.uniforms.uIgn.value.copy(ignLocal);
  fire.uniforms.uR.value = BALL_R;

  const rand = rng(77);
  const _v = new THREE.Vector3();
  /** How much light from the rim scatters toward the eye off something at p (it's between the eye and the light). */
  const fwdScatter = (p: THREE.Vector3, power: number) =>
    Math.pow(Math.max(0, -RIM_DIR.dot(_v.copy(camera.position).sub(p).normalize())), power);

  // ---- fibres: felt knocked loose by the hit, drifting off in slow motion ----
  const FIBRES = 380;
  const back = velocityAt(0, new THREE.Vector3()).normalize().negate();
  const fibres = Array.from({ length: FIBRES }, () => {
    // Mostly from the face the racket struck (the trailing side), some from all round.
    const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    if (rand() < 0.75) d.lerp(back, 0.45 + rand() * 0.4).normalize();
    // Also a sprinkle off the upper-right edge, where the opening frame looks.
    if (rand() < 0.3) d.lerp(EDGE.clone().normalize(), 0.7).normalize();
    const born = -0.25 + rand() * 0.2;
    return {
      born,
      origin: ballAt(born, new THREE.Vector3()).addScaledVector(d, BALL_R * (1.01 + rand() * 0.03)),
      // Left behind by the ball: some of its speed, thrown off its surface, then air drag.
      // Knocked loose, they keep most of the ball's speed and fall behind it slowly.
      vel: velocityAt(born, new THREE.Vector3()).multiplyScalar(0.84 + rand() * 0.13)
        .addScaledVector(d, 0.03 + rand() * 0.14).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.06)),
      axis: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
      // Felt fibres are crimped, not straight: each bends once along its length.
      bend: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(0.35 + rand() * 0.4),
      spin: (rand() - 0.5) * 6,
      len: 0.003 + rand() * 0.008,
      shade: 0.6 + rand() * 0.6,
    };
  });
  const fibrePos = new Float32Array(FIBRES * 12), fibreCol = new Float32Array(FIBRES * 12);
  const fibreGeo = new LineSegmentsGeometry();
  fibreGeo.setPositions(fibrePos);
  fibreGeo.setColors(fibreCol);
  const fibreMat = new LineMaterial({ linewidth: 0.0006, worldUnits: true, vertexColors: true, transparent: true, depthWrite: false });
  fibreMat.blending = THREE.AdditiveBlending;
  fibreMat.resolution.set(W * dpr, H * dpr);
  const fibreLines = new LineSegments2(fibreGeo, fibreMat);
  fibreLines.frustumCulled = false;
  scene.add(fibreLines);

  // ---- dust in the air: it catches the rim light and shows the camera moving ----
  const MOTES = 1100;
  const motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    motePos.set([-5 + rand() * 7, -2.6 + rand() * 5, -5.5 + rand() * 7], i * 3);
    moteSeed[i] = rand();
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uFocus: { value: 4 }, uLight: { value: RIM_DIR.clone() }, uFade: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uScale, uFocus, uFade, uTime;
      uniform vec3 uLight;
      varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.6 + aSeed * 40.0), cos(uTime * 0.5 + aSeed * 31.0), sin(uTime * 0.4 + aSeed * 17.0)) * 0.03;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = -mv.z;
        vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
        // Dust glows most between the eye and the light.
        float fwd = pow(max(0.0, -dot(uLight, toCam)), 3.0);
        float sharp = (0.0035 + aSeed * 0.004) * uScale / max(depth, 0.01);
        float coc = 70.0 * abs(depth - uFocus) / max(depth, 0.01);
        float size = clamp(sharp + coc, 1.5, 28.0);
        gl_PointSize = size;
        vA = (0.08 + 1.3 * fwd) * (0.4 + aSeed) * uFade * min(1.0, sharp * sharp / (size * size) * 6.0 + 0.04)
           * smoothstep(0.8, 2.0, depth);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.6, r) * vA;
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * a, a);
      }`,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // ---- sparks: born on the burning edge, thrown downwind, cooling as they go ----
  const SPARKS = 420, BURST = 180;
  const sparks = Array.from({ length: SPARKS + BURST }, (_, i) => {
    const burst = i >= SPARKS;
    return {
      // A burst as it catches, then a steady stream.
      born: burst ? IGNITE + rand() * 0.12 : IGNITE + 0.1 + rand() * (SCORE.scan[1] - IGNITE - 0.2),
      dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
      speed: burst ? 1.6 + rand() * 2.4 : 0.9 + rand() * 1.6,
      life: burst ? 0.25 + rand() * 0.45 : 0.35 + rand() * 0.7,
      spread: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(burst ? 2.2 : 0.9),
      heat: burst ? 1.1 + rand() * 0.6 : 0.6 + rand() * 0.8,
    };
  });
  const sparkPos = new Float32Array(sparks.length * 6), sparkCol = new Float32Array(sparks.length * 6);
  const sparkGeo = new LineSegmentsGeometry();
  sparkGeo.setPositions(sparkPos);
  sparkGeo.setColors(sparkCol);
  const sparkMat = new LineMaterial({ linewidth: 0.0042, worldUnits: true, vertexColors: true, transparent: true, depthWrite: false });
  sparkMat.blending = THREE.AdditiveBlending;
  sparkMat.resolution.set(W * dpr, H * dpr);
  const sparkLines = new LineSegments2(sparkGeo, sparkMat);
  sparkLines.frustumCulled = false;
  scene.add(sparkLines);

  // ---- passes ----------------------------------------------------------------------
  const rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const composite = new ShaderPass(fire.compositeShader);
  composite.uniforms.tFire.value = fire.target.texture; // ShaderPass clones uniforms, dropping render-target textures
  composer.addPass(composite);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.45, 1.05));
  composer.addPass(new OutputPass());

  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), vel = new THREE.Vector3(), wind = new THREE.Vector3();
  const tmp = new THREE.Vector3(), toLocal = new THREE.Matrix3(), m4 = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), ax = new THREE.Vector3(), fq = new THREE.Quaternion();
  const PALE = new THREE.Color('#f1f8b8').convertSRGBToLinear();

  return {
    render(t) {
      filmCamera(t, W / H, camera);
      // It opens in the dark, the rim light alone catching the fuzz; the key comes up as the camera pulls out.
      const up = 0.12 + 0.88 * smooth(ramp(t, 0.08, 0.75));
      key.intensity = 1.55 * up;
      // ...and the rim starts stronger, so the fuzz on the edge glows against the black.
      rim.intensity = 4.2 + 3.8 * (1 - up);
      fill.intensity = 0.35 * up;
      scene.environmentIntensity = 0.08 * up;
      ballAt(t, pos);
      orientationAt(t, q);
      ball.group.position.copy(pos);
      ball.group.quaternion.copy(q);

      // The burn: nothing before the catch, then spreading over the felt.
      const burn = t < IGNITE ? -0.1 : 0.08 + 0.26 * smooth(ramp(t, IGNITE, ARRIVE)) + 0.06 * ramp(t, ARRIVE, SCORE.scan[1]);
      const sy = t < SCORE.scan[0] ? -9 : t > SCORE.scan[1] ? 9 : scanY(t);
      ball.uniforms.uBurn.value = burn;
      ball.uniforms.uScanY.value = sy;
      ball.uniforms.uTime.value = t;
      ball.group.visible = sy < BALL_R * 1.05;

      // Wind: the flame streams back from the flight, then rises once the ball has stopped.
      velocityAt(t, vel);
      wind.copy(vel).multiplyScalar(-0.55).add(tmp.set(0, 0.85, 0)).normalize();
      // It catches with a flare, then settles to a steady burn.
      const flare = t < IGNITE ? 0 : Math.exp(-(t - IGNITE) * 6) * smooth(ramp(t, IGNITE, IGNITE + 0.05));
      // And dies down as the scan takes what's left of the ball.
      const level = t < IGNITE ? 0 : (smooth(ramp(t, IGNITE, IGNITE + 0.3)) + 0.9 * flare) * (1 - smooth(ramp(t, 3.1, 3.72)));
      const fu = fire.uniforms;
      fu.uCenter.value.copy(pos);
      fu.uWind.value.copy(wind);
      fu.uBurn.value = burn;
      fu.uScanY.value = sy;
      fu.uTime.value = t;
      fu.uLevel.value = ball.group.visible ? level : 0;
      toLocal.setFromMatrix4(m4.makeRotationFromQuaternion(q.clone().invert()));
      (fu.uToLocal.value as THREE.Matrix3).copy(toLocal);

      // The fire lights the ball from where it's burning, with a flash as it catches.
      const ignWorld = tmp.copy(ignLocal).applyQuaternion(q);
      const above = THREE.MathUtils.smoothstep(pos.y + ignWorld.y * BALL_R, sy - 0.1, sy + 0.25);
      const flicker = 1 + Math.sin(t * 31) * 0.12 + Math.sin(t * 17) * 0.1;
      fireLight.position.copy(pos).addScaledVector(ignWorld, BALL_R * 1.45).addScaledVector(wind, 0.45);
      fireLight.intensity = (3.6 * level * flicker + 16 * flare) * above;
      fireLight2.position.copy(pos).addScaledVector(ignWorld, BALL_R * 1.1).add(tmp.set(0, 0.35, 0.3));
      fireLight2.intensity = 1.2 * level * flicker * above;

      // Fibres: each turns slowly as it drifts, lit by the key and glowing where the rim light is behind it.
      const fibreFade = 1 - smooth(ramp(t, 0.9, 1.6));
      for (let i = 0; i < FIBRES; i++) {
        const f = fibres[i], age = t - f.born, o = i * 12;
        if (fibreFade <= 0) { fibrePos.fill(0, o, o + 12); fibreCol.fill(0, o, o + 12); continue; }
        // Air drag slows them, so the ball pulls away.
        const s = (1 - Math.exp(-age * 0.9)) / 0.9;
        a.copy(f.origin).addScaledVector(f.vel, s).add(tmp.set(0, -0.05 * age * age, 0));
        fq.setFromAxisAngle(tmp.set(0, 1, 0), f.spin * age);
        ax.copy(f.axis).applyQuaternion(fq).multiplyScalar(f.len * 0.5);
        // The middle of the fibre, pushed off the line: a crimp.
        const mid = tmp.copy(f.bend).applyQuaternion(fq).multiplyScalar(f.len * 0.3).add(a);
        b.copy(a).add(ax);
        a.sub(ax);
        const along = ax.normalize().dot(KEY_DIR);
        const lit = 0.1 + 0.55 * Math.sqrt(1 - along * along) + 2.4 * fwdScatter(mid, 6);
        const c = 0.6 * lit * f.shade * fibreFade;
        fibrePos.set([a.x, a.y, a.z, mid.x, mid.y, mid.z, mid.x, mid.y, mid.z, b.x, b.y, b.z], o);
        // A loose fibre is paler than the felt it came from, its ends fading.
        const e = 0.55;
        fibreCol.set([PALE.r * c * e, PALE.g * c * e, PALE.b * c * e, PALE.r * c, PALE.g * c, PALE.b * c,
          PALE.r * c, PALE.g * c, PALE.b * c, PALE.r * c * e, PALE.g * c * e, PALE.b * c * e], o);
      }
      fibreGeo.setPositions(fibrePos);
      fibreGeo.setColors(fibreCol);

      // Dust: in focus at the subject; gone before the live scene takes over.
      const mu = moteMat.uniforms;
      mu.uScale.value = (H * dpr * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      mu.uFocus.value = camera.position.distanceTo(pos);
      mu.uFade.value = 1 - smooth(ramp(t, 1.8, 2.6));
      mu.uTime.value = t;
      motes.visible = mu.uFade.value > 0;

      // Sparks: each a short streak along its path; gone once its life is out.
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i], age = t - s.born;
        const o = i * 6;
        if (age < 0 || age > s.life || t > SCORE.scan[1]) { sparkPos.fill(0, o, o + 6); sparkCol.fill(0, o, o + 6); continue; }
        // Born on the burning side of the ball at its birth moment.
        const bq = orientationAt(s.born, new THREE.Quaternion());
        const from = new THREE.Vector3().copy(ignLocal).add(tmp.copy(s.dir).multiplyScalar(0.55)).normalize().applyQuaternion(bq);
        const origin = ballAt(s.born, new THREE.Vector3()).addScaledVector(from, BALL_R);
        if (origin.y < (s.born < SCORE.scan[0] ? -9 : scanY(s.born))) { sparkPos.fill(0, o, o + 6); sparkCol.fill(0, o, o + 6); continue; }
        const w0 = velocityAt(s.born, new THREE.Vector3()).multiplyScalar(-0.55).add(tmp.set(0, 0.85, 0)).normalize();
        const v = w0.multiplyScalar(s.speed).add(from.multiplyScalar(0.5)).add(s.spread);
        const head = origin.clone().addScaledVector(v, age).add(tmp.set(0, 0.25 * age * age, 0));
        const tail = origin.clone().addScaledVector(v, Math.max(0, age - 0.045)).add(tmp.set(0, 0.25 * Math.max(0, age - 0.045) ** 2, 0));
        const heat = Math.max(0, 1 - age / s.life) * s.heat;
        sparkPos.set([head.x, head.y, head.z, tail.x, tail.y, tail.z], o);
        sparkCol.set([3.2 * heat + 0.2, 1.3 * heat + 0.05, 0.35 * heat, 0.5 * heat, 0.18 * heat, 0.05 * heat], o);
      }
      sparkGeo.setPositions(sparkPos);
      sparkGeo.setColors(sparkCol);

      fire.render(renderer, camera);
      composer.render();
    },
    dispose() {
      fire.dispose(); ball.dispose(); sparkGeo.dispose(); sparkMat.dispose(); fibreGeo.dispose(); fibreMat.dispose();
      moteGeo.dispose(); moteMat.dispose(); rt.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
