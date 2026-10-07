/**
 * Is this WebGL context running on a real GPU?
 *
 * failIfMajorPerformanceCaveat alone is not enough: current Chromium hands out
 * a SwiftShader (CPU) context even with it set, which is exactly what headless
 * Chrome (and so Lighthouse) runs on. So the renderer's name is checked too.
 * Software renderers get the stills instead of a stuttering animation.
 */
export function onRealGpu(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return !/swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name);
}
