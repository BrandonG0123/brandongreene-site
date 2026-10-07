/**
 * "See the work", guided.
 *
 * A plain jump to #work flies through the pinned serve chapter in half a second:
 * the stage holds still while the figure whips through the whole serve, so it
 * looks frozen, then lurches on. Instead, the button walks the reader down at
 * reading pace: into the serve, through each step of it with its sentence, a
 * beat on each, then on to the work.
 *
 * The reader stays in charge. Any wheel, touch, click or drag stops the tour
 * where it is. A key press skips straight to the work (and moves focus there,
 * as the link would have). Reduced motion, a modified click, or a serve that
 * isn't live: the ordinary jump. Without JavaScript it is an ordinary link.
 */

// Where each sentence is fully on screen, as serve progress (0–1). These sit
// inside the windows ServeChapter fades each sentence through, and line up with
// the serve's phases: ready, trophy, follow-through.
const HOLDS = [0.17, 0.48, 0.86];

// Pace, in ms. Each move eases in and out; each hold is long enough to read the
// sentence at a glance, short enough not to feel stuck. The last hold is longer:
// that sentence carries the link.
const ENTER = 1500;
const MOVE = 1600;
const READ = [1000, 1100, 1500];
const LEAVE = 1400;

// The first move answers the click at once and glides to a stop (a slow
// ease-in there reads as lag). Moves between sentences start and stop gently
// with an even middle, so the swing never whips past.
const glide = (t: number) => 1 - (1 - t) ** 2;
const even = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

type Step = { to: () => number; ms: number; ease: (t: number) => number } | { hold: number };

export function initTour() {
  const link = document.querySelector<HTMLAnchorElement>('a[data-tour]');
  const serve = document.querySelector<HTMLElement>('[data-serve]');
  const target = link?.hash ? document.getElementById(link.hash.slice(1)) : null;
  if (!link || !serve || !target) return;

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const maxY = () => root.scrollHeight - innerHeight;
  const serveAt = (p: number) => {
    const top = serve.getBoundingClientRect().top + scrollY;
    return top + p * (serve.offsetHeight - innerHeight);
  };
  const workY = () => {
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    return Math.min(maxY(), target.getBoundingClientRect().top + scrollY - margin);
  };
  const jump = (y: number) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });

  // Arrive the way the link would have: address bar updated, focus moved to the
  // section's heading (without scrolling), so Tab carries on from there.
  const arrive = () => {
    history.pushState(null, '', link.hash);
    const heading = target.querySelector<HTMLElement>('h2, h1') ?? target;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };

  let running = false;

  const run = () => {
    const steps: Step[] = [
      { to: () => serveAt(HOLDS[0]), ms: ENTER, ease: glide },
      { hold: READ[0] },
      { to: () => serveAt(HOLDS[1]), ms: MOVE, ease: even },
      { hold: READ[1] },
      { to: () => serveAt(HOLDS[2]), ms: MOVE, ease: even },
      { hold: READ[2] },
      { to: workY, ms: LEAVE, ease: even },
    ];

    running = true;
    root.dataset.touring = '';

    let i = -1, from = 0, to = 0, ms = 0, t = 0, last = 0, set = scrollY, raf = 0;
    let curve = even;

    const next = (): boolean => {
      if (++i >= steps.length) return false;
      const s = steps[i];
      from = scrollY;
      if ('hold' in s) { to = from; ms = s.hold; }
      else { to = Math.max(0, Math.min(maxY(), s.to())); ms = s.ms; curve = s.ease; }
      t = 0;
      return true;
    };

    const end = (how: 'done' | 'skip' | 'stop') => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      off();
      delete root.dataset.touring;
      if (how === 'skip') jump(workY());
      if (how !== 'stop') arrive();
      window.dispatchEvent(new Event('tourend'));
    };

    const frame = (now: number) => {
      // Something else moved the page (a scrollbar drag, find-in-page): the
      // reader has taken over.
      if (Math.abs(scrollY - set) > 4) return end('stop');

      // Capped step, so a backgrounded tab resumes where it was, not at the end.
      t += Math.min(50, now - last);
      last = now;
      const k = Math.min(1, t / ms);
      if (to !== from) {
        set = Math.round(from + (to - from) * curve(k));
        jump(set);
        set = scrollY; // what the browser actually did (clamping, rounding)
      }
      if (k >= 1 && !next()) return end('done');
      raf = requestAnimationFrame(frame);
    };

    // The reader's own input always wins.
    const stop = () => end('stop');
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return end('stop'); // browser shortcuts pass through
      e.preventDefault();
      end('skip');
    };
    const opts = { passive: true, capture: true } as const;
    const off = () => {
      window.removeEventListener('wheel', stop, opts);
      window.removeEventListener('touchstart', stop, opts);
      window.removeEventListener('pointerdown', stop, opts);
      window.removeEventListener('keydown', key, true);
    };
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('touchstart', stop, opts);
    window.addEventListener('pointerdown', stop, opts);
    window.addEventListener('keydown', key, true);

    next();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  link.addEventListener('click', (e) => {
    if (running || reduced.matches) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // Only when the serve is actually pinned and scrubbed; otherwise there is
    // nothing to walk through, and the ordinary jump is right.
    if (!serve.classList.contains('serve--live')) return;
    e.preventDefault();
    run();
  });
}
