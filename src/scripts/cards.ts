/**
 * Project cards: staggered reveal on entry, a spotlight that follows the
 * pointer, and a spring-physics tilt.
 *
 * Built on Motion (motion.dev): inView for entry, animate with springs for the
 * tilt, stagger for sequencing. Everything here is decoration on top of a plain,
 * fully working list — with JavaScript off or reduced motion on, the cards are
 * simply there.
 */
import { animate, inView, stagger } from 'motion';

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
  if (finePointer && liveMedia.length) {
    const goLive = () => {
      for (const media of liveMedia) {
        const io = new IntersectionObserver(
          ([entry]) => {
            if (!entry.isIntersecting) return;
            io.disconnect();
            import('./viewer')
              .then((v) => v.mountViewer(media, { mode: 'card', pointerSurface: media.closest<HTMLElement>('[data-card]') }))
              .catch(() => { /* the still simply stays */ });
          },
          { rootMargin: '300px' },
        );
        io.observe(media);
      }
    };
    window.addEventListener('pointermove', goLive, { once: true, passive: true });
  }

  // Reveal: only cards that start below the fold get hidden, so nothing already
  // on screen ever blinks out.
  const below = cards.filter((c) => c.getBoundingClientRect().top > innerHeight * 0.92);
  for (const c of below) {
    c.style.opacity = '0';
    c.style.transform = 'translateY(40px)';
  }
  const lists = new Set(below.map((c) => c.closest('ul') ?? c.parentElement!));
  for (const list of lists) {
    inView(
      list as Element,
      () => {
        const items = below.filter((c) => list.contains(c));
        animate(items, { opacity: [0, 1], y: [40, 0] }, {
          delay: stagger(0.09),
          type: 'spring',
          stiffness: 140,
          damping: 22,
        });
      },
      { amount: 0.15 },
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
