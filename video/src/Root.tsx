/**
 * Two cuts of the same film: wide for landscape screens, tall for phones.
 * The page picks the one nearer the stage's shape (layout.ts videoAspect).
 */
import React from 'react';
import { Composition } from 'remotion';
import { Opening } from './Opening';
import { SCORE } from '../../src/scripts/orbit/score';

export const FPS = 30;
const frames = Math.ceil(SCORE.videoEnd * FPS);

export const Root: React.FC = () => (
  <>
    <Composition id="opening-16x9" component={Opening} width={1920} height={1080} fps={FPS} durationInFrames={frames} defaultProps={{ dpr: 1.5 }} />
    <Composition id="opening-9x16" component={Opening} width={1080} height={1920} fps={FPS} durationInFrames={frames} defaultProps={{ dpr: 1 }} />
  </>
);
