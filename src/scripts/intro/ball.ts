/**
 * The opening shot: a real-looking tennis ball, and the fire that takes it.
 *
 * Felt is a physical material with sheen (the fuzz catching light) over a fine
 * procedural fibre bump; the seam is a white rubber tube following the real
 * seam curve. Lighting comes from a generated studio environment, so there is
 * no HDR file to download.
 *
 * The burn is a dissolve: each point of the shell has a threshold from
 * burnThreshold() (shapes.ts, mirrored in GLSL); as uBurn passes it the felt
 * chars, glows along a hot edge, and is gone. Inside, the shell is dark rubber.
 */
import * as THREE from 'three';
import { BURN_GLSL, seamPoint } from './shapes';

export const BALL_RADIUS = 0.62;

/** A fine fibre texture: thousands of short random strokes, used as a bump map. */
function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height;
    const a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 7;
    const v = 90 + Math.random() * 120;
    g.strokeStyle = `rgba(${v},${v},${v},0.35)`;
    g.lineWidth = 0.6 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.anisotropy = 4;
  return t;
}

/** Inject the burn into a standard/physical material. */
function burnable(mat: THREE.MeshPhysicalMaterial, uniforms: { uBurn: { value: number } }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBurn = uniforms.uBurn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vDir;
         uniform float uBurn;
         ${BURN_GLSL}
         vec3 blackbody(float t) {
           return mix(mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.38, 0.05), smoothstep(0.0, 0.5, t)),
                      vec3(1.0, 0.92, 0.7), smoothstep(0.5, 1.0, t));
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float edge = burnThreshold(vDir) - uBurn;
         if (edge < 0.0) discard;
         // Char runs ahead of the flame; inside the shell is dark rubber.
         diffuseColor.rgb *= mix(0.04, 1.0, smoothstep(0.0, 0.07, edge));
         if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.035, 0.03, 0.028);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float hot = 1.0 - smoothstep(0.0, 0.028, edge);
         totalEmissiveRadiance += blackbody(hot) * hot * 2.2 * step(0.0001, uBurn);`,
      );
  };
}

export interface Ball {
  group: THREE.Group;
  setBurn(v: number): void;
  dispose(): void;
}

export function createBall(): Ball {
  const uniforms = { uBurn: { value: -0.1 } };
  const group = new THREE.Group();

  const fuzz = feltTexture();
  const felt = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#cfee14'),
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#f2ffb2'),
    bumpMap: fuzz,
    bumpScale: 3,
    side: THREE.DoubleSide,
  });
  burnable(felt, uniforms);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 128, 96), felt);
  group.add(shell);

  // The seam: white rubber, a hair proud of the felt so it reads at any angle.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 400; i++) pts.push(seamPoint((i / 400) * Math.PI * 2).multiplyScalar(BALL_RADIUS * 1.002));
  const seamMat = new THREE.MeshPhysicalMaterial({ color: '#f1efe6', roughness: 0.55, sheen: 0.3 });
  burnable(seamMat, uniforms);
  const seam = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 600, BALL_RADIUS * 0.022, 10, true),
    seamMat,
  );
  group.add(seam);

  return {
    group,
    setBurn(v) { uniforms.uBurn.value = v; },
    dispose() {
      fuzz.dispose(); felt.dispose(); seamMat.dispose();
      shell.geometry.dispose(); seam.geometry.dispose();
    },
  };
}
