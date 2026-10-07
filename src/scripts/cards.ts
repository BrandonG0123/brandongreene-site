/**
 * Project cards: staggered reveal on entry, a spotlight that follows the
 * pointer, and a spring-physics tilt.
 *
 * Built on Motion (motion.dev): inView for entry, springs for the tilt, and a
 * short stagger for cards that arrive together. Everything here is decoration
 * on top of a plain, fully working list — with JavaScript off or reduced motion
 * on, the cards are simply there.
 */
import { animate, inView } from 'motion';

export function initCards(root: ParentNode = document) {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-card]')];
  if (!cards.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Spotlight: purely a colour change under the cursor, so it stays on even with
  // reduced motion — nothing moves.
  for (const card of cards) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  if (reduced) return;

  // Live 3D in cards: on the first mouse movement anywhere on the page, swap
  // each card's still for its real model, once the card is near the viewport.
  // Never at load (that's what keeps the page fast), never for touch, and never
  // with reduced motion — those all keep the still.
  const liveMedia = [...root.querySelectorAll<HTMLElement>('[data-card-media][data-src]')];
  // Building a live model (parse three.js, create a GL context, compile shaders)
  // costs a few frames. During the guided scroll that would be a visible hitch
  // just as the cards arrive, so it waits until the page has come to rest and
  // the cards have finished rising in; the still is showing in the meantime.
  const afterTour = (fn: () => void) => {
    if (!('touring' in document.documentElement.dataset)) return fn();
    window.addEventListener('tourend', () => setTimeout(fn, 1200), { once: true });
  };
  if (finePointer && liveMedia.length) {
    const goLive = () => {
      for (const media of liveMedia) {
        const io = new IntersectionObserver(
          ([entry]) => {
            if (!entry.isIntersecting) return;
            io.disconnect();
            afterTour(() =>
              import('./viewer')
                .then((v) => v.mountViewer(media, { mode: 'card', pointerSurface: media.closest<HTMLElement>('[data-card]') }))
                .catch(() => { /* the still simply stays */ }),
            );
          },
          { rootMargin: '300px' },
        );
        io.observe(media);
      }
    };
    window.addEventListener('pointermove', goLive, { once: true, passive: true });
  }

  // Reveal: only cards that start below the fold get hidden, so nothing already
  // on screen ever blinks out. Each card rises as soon as any of it is in view.
  // (Waiting for a share of the whole LIST, as this once did, can never happen
  // on a short window: the list is taller than the screen, so the cards stayed
  // invisible under their heading.) Cards that arrive together, side by side,
  // still rise in a quick stagger.
  const below = cards.filter((c) => c.getBoundingClientRect().top > innerHeight * 0.92);
  for (const c of below) {
    c.style.opacity = '0';
    c.style.transform = 'translateY(40px)';
  }
  let lastAt = 0, chain = 0;
  for (const c of below) {
    inView(
      c,
      () => {
        const now = performance.now();
        chain = now - lastAt < 120 ? chain + 1 : 0;
        lastAt = now;
        animate(c, { opacity: [0, 1], y: [40, 0] }, {
          delay: chain * 0.09,
          type: 'spring',
          stiffness: 140,
          damping: 22,
        });
      },
      { amount: 'some', margin: '0px 0px -6% 0px' },
    );
  }

  // Tilt: a few degrees toward the pointer, sprung back on leave.
  if (!finePointer) return;
  for (const card of cards) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      animate(card, { rotateX: -py * 5, rotateY: px * 7 }, { type: 'spring', stiffness: 260, damping: 26 });
    });
    card.addEventListener('pointerleave', () => {
      animate(card, { rotateX: 0, rotateY: 0 }, { type: 'spring', stiffness: 180, damping: 18 });
    });
  }
}
