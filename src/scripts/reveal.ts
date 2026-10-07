/**
 * Chapter headings arrive word by word as they scroll into view — the same
 * motion as the hero title, so every act of the page is announced the same way.
 *
 * Plays once per heading (choreography, not constant motion). Only headings that
 * start below the fold are hidden first, so nothing already on screen blinks.
 * Text stays real text: words are wrapped in spans with real spaces between
 * them, which screen readers read exactly as before. Reduced motion or no
 * JavaScript: headings are simply there.
 */
export async function initReveals() {
  const targets = [...document.querySelectorAll<HTMLElement>('[data-reveal-words]')].filter(
    (el) => el.getBoundingClientRect().top > innerHeight * 0.9,
  );
  if (!targets.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { animate, inView, stagger } = await import('motion');

  for (const el of targets) {
    const words = (el.textContent ?? '').trim().split(/\s+/);
    el.textContent = '';
    const inner: HTMLElement[] = [];
    words.forEach((w, i) => {
      if (i) el.append(' ');
      const clip = document.createElement('span');
      clip.className = 'rw';
      const word = document.createElement('span');
      word.textContent = w;
      word.style.transform = 'translateY(105%)';
      clip.append(word);
      el.append(clip);
      inner.push(word);
    });

    inView(
      el,
      () => {
        animate(inner, { transform: ['translateY(105%)', 'translateY(0%)'] }, {
          delay: stagger(0.06),
          duration: 0.9,
          ease: [0.16, 1, 0.3, 1],
        });
      },
      // Fire as soon as any part enters view. A stricter threshold (60%) can
      // never be met by a tall heading on a short landscape screen, which would
      // leave the heading hidden for good.
      { amount: 'some', margin: '0px 0px -8% 0px' },
    );
  }
}
