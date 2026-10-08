/**
 * The scan, drawn live over the video: a thin sheet of light whose edge is a
 * line across the whole stage, and a bright ring where it cuts the ball. It
 * climbs the ball (ball.ts scanY) and is gone once it's over the top.
 */
import * as THREE from 'three';
import { BALL_R } from './layout';
import { scanY } from './ball';
import { SCORE, ramp } from './score';

export interface Scan {
  group: THREE.Group;
  set(t: number): void;
  dispose(): void;
}

export function createScan(): Scan {
  const group = new THREE.Group();
  const sheetUniforms = { uOn: { value: 0 } };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.ShaderMaterial({
    uniforms: sheetUniforms,
    vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
    // Only a hair's depth of the sheet glows, so from the camera it reads as a line.
    fragmentShader: `uniform float uOn; varying vec3 vW;
      void main() {
        float a = exp(-abs(vW.z) * 55.0) * (exp(-abs(vW.x) * 0.8) * 0.9 + 0.1) * uOn;
        vec3 c = vec3(0.30, 0.95, 1.0) * a;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  }));
  sheet.rotation.x = -Math.PI / 2;

  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 2.2, 2.4), toneMapped: false, transparent: true, depthWrite: false });
  ringMat.blending = THREE.AdditiveBlending;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 160), ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(sheet, ring);

  return {
    group,
    set(t) {
      const [a, b] = SCORE.scan;
      const on = ramp(t, a - 0.08, a) * (1 - ramp(t, b, b + 0.12));
      group.visible = on > 0;
      if (!group.visible) return;
      const y = scanY(t);
      sheet.position.y = y;
      sheetUniforms.uOn.value = on;
      const r = Math.sqrt(Math.max(0, BALL_R * BALL_R - y * y)) * 1.01;
      ring.visible = r > 0.01;
      ring.position.y = y;
      ring.scale.set(r, r, 1);
      ring.material.opacity = on;
    },
    dispose() { sheet.geometry.dispose(); (sheet.material as THREE.Material).dispose(); ring.geometry.dispose(); ringMat.dispose(); },
  };
}
