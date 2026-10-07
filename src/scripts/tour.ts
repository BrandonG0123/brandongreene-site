/**
 * "See the work", guided.
 *
 * A plain jump to #work flies through the pinned serve chapter in half a second:
 * the stage holds still while the figure whips through the whole serve, so it
 * looks frozen, then lurches on. Instead, the button walks the reader down at
 * reading pace: into the serve, through each step of it with its sentence in
 * slow motion, then on to the work.
 *
 * The reader stays in charge. Any wheel, touch, click or drag stops the tour
 * where it is. A key press skips straight to the work (and moves focus there,
 * as the link would have). Reduced motion, a modified click, or a serve that
 * isn't live: the ordinary jump. Without JavaScript it is an ordinary link.
 */

// The path, as [seconds, where]: "start" is wherever the reader is, numbers are
// serve progress (0–1), "work" is the destination. It never stops. Between
// sentences it moves at an ordinary scroll pace; while a sentence is fully up
// (ServeChapter fades each one in over a window of progress: 0.08–0.26,
// 0.40–0.56, 0.70–1) it slows to a slow-motion drift, so the text holds still
// to be read while the figure keeps moving through the serve. Stopping dead
// read as the whole page freezing.
//
// Tune the pace here: each sentence gets about two seconds fully on screen.
const PATH: [number, number | 'start' | 'work'][] = [
  [0, 'start'],
  [1.4, 0.1],
  [3.2, 0.22],
  [4.2, 0.42],
  [6.0, 0.54],
  [7.0, 0.72],
  [9.0, 0.92],
  [10.4, 'work'],
];

/**
 * A smooth, monotone curve through the keyframes (Fritsch–Carlson). Speed
 * changes continuously, so there is no jolt where a drift meets a move, and it
 * never overshoots a keyframe or runs backwards. It leaves the start already
 * moving (the click is answered at once) and settles to rest at the end.
 */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length - 1;
  const h = xs.slice(0, n).map((x, i) => xs[i + 1] - x);
  const m = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi);
  const d = xs.map((_, i) => {
    if (i === 0) return 1.6 * m[0];
    if (i === n) return 0;
    if (m[i - 1] * m[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  });
  return (x: number) => {
    let i = 0;
    while (i < n - 1 && x > xs[i + 1]) i++;
    const t = Math.min(1, Math.max(0, (x - xs[i]) / h[i]));
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * d[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * d[i + 1];
  };
}

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
    // Positions are measured once, now: nothing on the way changes the layout.
    const ys = PATH.map(([, at]) => (at === 'start' ? scrollY : at === 'work' ? workY() : serveAt(at)))
      .map((y) => Math.max(0, Math.min(maxY(), y)));
    const path = monotone(PATH.map(([sec]) => sec * 1000), ys);
    const total = PATH[PATH.length - 1][0] * 1000;

    running = true;
    root.dataset.touring = '';

    let t = 0, last = 0, set = scrollY, raf = 0;

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

      // Real elapsed time, so a slow device keeps the same pace rather than
      // playing in slow motion. One long hitch is allowed to catch up; a hidden
      // tab pauses outright (see onHide) and resumes where it left off.
      t = Math.min(total, t + Math.min(250, now - last));
      last = now;
      jump(path(t));
      set = scrollY; // what the browser actually did (clamping, rounding)
      if (t >= total) return end('done');
      raf = requestAnimationFrame(frame);
    };

    // The reader's own input always wins.
    const stop = () => end('stop');
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return end('stop'); // browser shortcuts pass through
      e.preventDefault();
      end('skip');
    };
    const onHide = () => {
      if (document.hidden) { cancelAnimationFrame(raf); return; }
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const opts = { passive: true, capture: true } as const;
    const off = () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('wheel', stop, opts);
      window.removeEventListener('touchstart', stop, opts);
      window.removeEventListener('pointerdown', stop, opts);
      window.removeEventListener('keydown', key, true);
    };
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('touchstart', stop, opts);
    window.addEventListener('pointerdown', stop, opts);
    window.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', onHide);

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
