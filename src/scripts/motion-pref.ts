/**
 * One "pause motion" choice for the whole site, remembered across visits.
 * The header's switch, the hero's own Pause button and the ambient drift all
 * read and write it, so pausing anywhere pauses everything.
 *
 * Stored on <html data-motion="paused|playing"> (set before first paint by the
 * inline script in BaseHead) and in localStorage under 'motion'.
 */
const root = document.documentElement;

export const motionPaused = () => root.dataset.motion === 'paused';

export function setMotionPaused(paused: boolean) {
  root.dataset.motion = paused ? 'paused' : 'playing';
  try { localStorage.setItem('motion', paused ? 'paused' : 'playing'); } catch { /* blocked: this page view only */ }
  window.dispatchEvent(new CustomEvent('motionchange', { detail: paused }));
}

export function onMotionChange(fn: (paused: boolean) => void) {
  window.addEventListener('motionchange', (e) => fn((e as CustomEvent<boolean>).detail));
}
