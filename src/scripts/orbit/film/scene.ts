/**
 * The opening film, as a scene that renders any moment from the score clock.
 * video/ renders it frame by frame into the opening videos; nothing here ships
 * in the page's own bundle.
 *
 *   0.0–1.1   flight: the ball, just hit, crosses frame in slow motion
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
import { SCORE, ramp, easeInOut, smooth } from '../score';
import { feltBall } from './felt';
import { createFire } from './fire';

const ARRIVE = SCORE.ignition[1];          // the ball comes to rest at the centre
const SETTLED = ARRIVE - 0.1;              // the camera is the live close-up from here
const IGNITE = SCORE.ignition[0];
const P0 = new THREE.Vector3(-2.9, -1.05, -1.4);
const MACRO_END = 0.75;                    // the opening macro has pulled back by here

/** Where the ball is: decelerating from P0 to rest at the origin. */
export function ballAt(t: number, out = new THREE.Vector3()) {
  const u = Math.min(1, Math.max(0, t / ARRIVE));
  return out.copy(P0).multiplyScalar(Math.pow(1 - u, 2.4));
}
function velocityAt(t: number, out = new THREE.Vector3()) {
  const u = Math.min(1, Math.max(0, t / ARRIVE));
  return out.copy(P0).multiplyScalar((-2.4 / ARRIVE) * Math.pow(1 - u, 1.4));
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
  scene.environmentIntensity = 0.14;
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 100);
  const near = closeDistance(W / H);

  // Light: a cold rim from behind, a warm key from above left, and the fire's own.
  const rim = new THREE.DirectionalLight('#9ff6ff', 4.2);
  rim.position.set(-2.2, 1.4, -4.2);
  const key = new THREE.DirectionalLight('#fff4e6', 1.7);
  key.position.set(-1.8, 3.2, 2.4);
  const fireLight = new THREE.PointLight('#ff7a22', 0, 3.5, 1.6);
  const fireLight2 = new THREE.PointLight('#ffb050', 0, 2.5, 1.6);
  scene.add(rim, key, fireLight, fireLight2);

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

  // ---- sparks: born on the burning edge, thrown downwind, cooling as they go ----
  const rand = rng(77);
  const SPARKS = 420;
  const sparks = Array.from({ length: SPARKS }, () => ({
    born: IGNITE + 0.1 + rand() * (SCORE.scan[1] - IGNITE - 0.2),
    dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
    speed: 0.9 + rand() * 1.6,
    life: 0.35 + rand() * 0.7,
    spread: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9),
    heat: 0.6 + rand() * 0.8,
  }));
  const sparkPos = new Float32Array(SPARKS * 6), sparkCol = new Float32Array(SPARKS * 6);
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
  const target = new THREE.Vector3(), tmp = new THREE.Vector3(), toLocal = new THREE.Matrix3(), m4 = new THREE.Matrix4();

  const placeCamera = (t: number) => {
    if (t >= SETTLED) {
      camera.fov = FOV;
      camera.position.set(0, 0, near);
      camera.lookAt(0, 0, 0);
    } else {
      // Open on a macro of the felt, pull back as it flies, then track in and
      // swing round to end dead on the live close-up.
      const pull = easeInOut(Math.min(1, t / MACRO_END));
      const k = easeInOut(Math.max(0, Math.min(1, (t - MACRO_END) / (SETTLED - MACRO_END))));
      ballAt(t, pos);
      // The macro looks along the ball's upper edge, where the fuzz is backlit against black.
      const limb = tmp.copy(pos).add(new THREE.Vector3(-0.42, 0.5, 0).multiplyScalar(BALL_R));
      target.copy(pos).multiplyScalar(0.55 * (1 - k)).lerp(limb, 1 - pull);
      const dist = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.55, 6.4, pull), near, k);
      const az = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.5, -0.32, pull), 0, k);
      const el = THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.1, 0.08, pull), 0, k);
      camera.fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(16, 22, pull), FOV, k);
      camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
      camera.lookAt(target);
    }
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  return {
    render(t) {
      placeCamera(t);
      ballAt(t, pos);
      orientationAt(t, q);
      ball.group.position.copy(pos);
      ball.group.quaternion.copy(q);

      // The burn: nothing before the catch, then spreading over the felt.
      const burn = t < IGNITE ? -0.1 : 0.08 + 0.26 * smooth(ramp(t, IGNITE, ARRIVE)) + 0.06 * ramp(t, ARRIVE, SCORE.scan[1]);
      const sy = t < SCORE.scan[0] ? -9 : t > SCORE.scan[1] ? 9 : scanY(t);
      ball.uniforms.uBurn.value = burn;
      ball.uniforms.uScanY.value = sy;
      ball.group.visible = sy < BALL_R * 1.05;

      // Wind: the flame streams back from the flight, then rises once the ball has stopped.
      velocityAt(t, vel);
      wind.copy(vel).multiplyScalar(-0.55).add(tmp.set(0, 0.85, 0)).normalize();
      const level = t < IGNITE ? 0 : smooth(ramp(t, IGNITE, IGNITE + 0.3));
      const fu = fire.uniforms;
      fu.uCenter.value.copy(pos);
      fu.uWind.value.copy(wind);
      fu.uBurn.value = burn;
      fu.uScanY.value = sy;
      fu.uTime.value = t;
      fu.uLevel.value = ball.group.visible ? level : 0;
      toLocal.setFromMatrix4(m4.makeRotationFromQuaternion(q.clone().invert()));
      (fu.uToLocal.value as THREE.Matrix3).copy(toLocal);

      // The fire lights the ball from where it's burning.
      const ignWorld = tmp.copy(ignLocal).applyQuaternion(q);
      const above = THREE.MathUtils.smoothstep(pos.y + ignWorld.y * BALL_R, sy - 0.1, sy + 0.25);
      const flicker = 1 + Math.sin(t * 31) * 0.12 + Math.sin(t * 17) * 0.1;
      fireLight.position.copy(pos).addScaledVector(ignWorld, BALL_R * 1.45).addScaledVector(wind, 0.45);
      fireLight.intensity = 3.6 * level * flicker * above;
      fireLight2.position.copy(pos).addScaledVector(ignWorld, BALL_R * 1.1).add(tmp.set(0, 0.35, 0.3));
      fireLight2.intensity = 1.2 * level * flicker * above;

      // Sparks: each a short streak along its path; gone once its life is out.
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i], age = t - s.born;
        let o = i * 6;
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
        o += 6;
      }
      sparkGeo.setPositions(sparkPos);
      sparkGeo.setColors(sparkCol);

      fire.render(renderer, camera);
      composer.render();
    },
    dispose() {
      fire.dispose(); ball.dispose(); sparkGeo.dispose(); sparkMat.dispose(); rt.dispose();
      pmrem.dispose(); renderer.dispose();
    },
  };
}
