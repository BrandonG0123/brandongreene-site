/**
 * Printed plastic: how every piece on the ring is "made".
 *
 * The object exists only up to the current layer (uPrint, 0 → 1 of its
 * height). Below the cut it's solid plastic with real layer lines: each layer
 * is a rounded bead, so the normal tips up at the top of a bead and down at
 * the bottom. The layer being laid down glows. Inside, through the open top,
 * it's dark. Above the cut, the rest of the object waits as an ice outline
 * (ghost), which fades once printing is done.
 *
 * Layers run along the object's own Y axis, the way it was printed.
 */
import * as THREE from 'three';

export interface PrintMaterialOptions {
  color: THREE.ColorRepresentation;
  /** Optional per-vertex 0–1 attribute `aSeam` printed in this second colour. */
  seamColor?: THREE.ColorRepresentation;
  /** Layers over the object's full height (unit sphere: height up to 2). */
  layers: number;
  roughness?: number;
}

export interface Printable {
  mesh: THREE.Mesh;
  ghost: THREE.LineSegments;
  /** Set the print front, 0 (nothing) to 1 (done), how visible the ghost is, and the send pulse. */
  set(print: number, ghost: number, pulse?: number): void;
  /** 0 at the bottom of the object, 1 at the top: where a local point's layer falls. */
  heightFraction(y: number): number;
  dispose(): void;
}

const HOT = 'vec3(1.0, 0.62, 0.28)';

/** Where horizontal planes every `step` cut the mesh: line segments, like a slicer's preview. */
export function contours(g: THREE.BufferGeometry, minY: number, step: number): THREE.BufferGeometry {
  const p = g.attributes.position, idx = g.index;
  const tris = idx ? idx.count / 3 : p.count / 3;
  const out: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const v = [a, b, c];
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(p, idx ? idx.getX(3 * t + k) : 3 * t + k);
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
    for (let L = Math.ceil((lo - minY) / step - 0.5); (L + 0.5) * step + minY <= hi; L++) {
      const y = (L + 0.5) * step + minY;
      let n = 0;
      for (let k = 0; k < 3; k++) {
        const P = v[k], Q = v[(k + 1) % 3];
        if ((P.y < y) !== (Q.y < y)) {
          const f = (y - P.y) / (Q.y - P.y);
          out.push(P.x + (Q.x - P.x) * f, y, P.z + (Q.z - P.z) * f);
          n++;
        }
      }
      if (n === 1) out.length -= 3; // grazing a vertex: no segment
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return lg;
}

export function printable(geometry: THREE.BufferGeometry, o: PrintMaterialOptions): Printable {
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox!.min.y, maxY = geometry.boundingBox!.max.y;
  const span = maxY - minY || 1;
  const uniforms = {
    uCut: { value: minY - 1 },
    uLH: { value: span / o.layers },
    uHot: { value: 0 },
    uPulse: { value: 0 },
  };
  const hasSeam = !!geometry.getAttribute('aSeam');

  const mat = new THREE.MeshStandardMaterial({
    color: o.color, roughness: o.roughness ?? 0.42, metalness: 0, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uSeamColor: { value: new THREE.Color(o.seamColor ?? o.color) } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        varying float vLocalY;
        varying vec3 vUpView;
        ${hasSeam ? 'attribute float aSeam; varying float vSeam;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocalY = position.y;
        vUpView = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        ${hasSeam ? 'vSeam = aSeam;' : ''}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCut, uLH, uHot, uPulse;
        uniform vec3 uSeamColor;
        varying float vLocalY;
        varying vec3 vUpView;
        ${hasSeam ? 'varying float vSeam;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vLocalY > uCut) discard;
        ${hasSeam ? 'diffuseColor.rgb = mix(diffuseColor.rgb, uSeamColor, smoothstep(0.3, 0.7, vSeam));' : ''}
        float ph = fract(vLocalY / uLH);
        // A faint seam where beads meet.
        diffuseColor.rgb *= 0.93 + 0.07 * smoothstep(0.0, 0.18, ph) * smoothstep(1.0, 0.82, ph);
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.1;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + vUpView * (fract(vLocalY / uLH) - 0.5) * 0.85 * (gl_FrontFacing ? 1.0 : -1.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // The layer going down now, and the two just under it still cooling.
        float below = (uCut - vLocalY) / uLH;
        float hot = uHot * (exp(-below * 1.6) * step(0.0, below));
        totalEmissiveRadiance += ${HOT} * hot * (gl_FrontFacing ? 1.4 : 2.2);
        // A flash of ice round the edges when this piece sends its thread to the centre.
        float rimP = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += vec3(0.30, 0.95, 1.0) * uPulse * (0.25 + rimP * 1.6);`);
  };
  mat.customProgramCacheKey = () => `printable${hasSeam ? '-seam' : ''}`;
  const mesh = new THREE.Mesh(geometry, mat);

  // The ghost: the slicer's view of the rest, one contour every other layer.
  const edges = contours(geometry, minY, span / o.layers * 2);
  const ghostUniforms = { uCut: uniforms.uCut, uGhost: { value: 0 } };
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: ghostUniforms,
    vertexShader: `varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uCut, uGhost; varying float vY;
      void main() {
        if (vY < uCut) discard;
        vec3 c = vec3(0.30, 0.95, 1.0) * uGhost * 0.55;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
      }`,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  });
  const ghost = new THREE.LineSegments(edges, ghostMat);

  return {
    mesh,
    ghost,
    set(print, g, pulse = 0) {
      uniforms.uPulse.value = pulse;
      const p = Math.max(0, Math.min(1, print));
      // Past the top (plus a margin for the hot band) the object is simply whole.
      uniforms.uCut.value = p >= 1 ? maxY + 1 : minY + p * span;
      uniforms.uHot.value = p > 0 && p < 1 ? 1 : 0;
      ghostUniforms.uGhost.value = g;
      mesh.visible = p > 0;
      ghost.visible = g > 0.001 && p < 1;
    },
    heightFraction(y) { return (y - minY) / span; },
    dispose() { mat.dispose(); edges.dispose(); ghostMat.dispose(); },
  };
}
