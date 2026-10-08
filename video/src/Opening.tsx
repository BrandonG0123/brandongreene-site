/**
 * The opening film: the site's own film scene (src/scripts/orbit/film),
 * rendered at each frame's moment on the score clock. The canvas is drawn at
 * `dpr` times the frame size and scaled down, which smooths the fuzz.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { createFilm, type Film } from '../../src/scripts/orbit/film/scene';

export const Opening: React.FC<{ dpr: number }> = ({ dpr }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [film, setFilm] = useState<Film | null>(null);
  const [handle] = useState(() => delayRender('building the film scene'));

  useLayoutEffect(() => {
    const f = createFilm(canvas.current!, width, height, dpr);
    setFilm(f);
    continueRender(handle);
    return () => f.dispose();
  }, [width, height, dpr, handle]);

  useLayoutEffect(() => {
    if (!film) return;
    film.render(frame / fps);
    // Block until the GPU has finished this frame, so the capture can't catch it half drawn.
    const gl = canvas.current!.getContext('webgl2');
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, [film, frame, fps]);

  return (
    <AbsoluteFill style={{ background: '#05060A' }}>
      <canvas ref={canvas} style={{ width, height }} />
    </AbsoluteFill>
  );
};
