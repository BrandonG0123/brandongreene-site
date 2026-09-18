// Fade blocks in as they scroll into view.
//
// Decoration only: if the browser can't do it, or the reader asked for less
// motion, everything is simply visible from the start. Nothing here affects
// what the page says or whether a control works.
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

export function initReveal(selector = "[data-reveal] > *, main > section") {
  const targets = [...document.querySelectorAll(selector)]
    .filter((el) => !el.closest("#v-scan, #v-saving, .stage"));
  if (REDUCED.matches || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  for (const el of targets) {
    // Anything already on screen shows immediately: no flash of blank page.
    if (el.getBoundingClientRect().top < innerHeight * 0.9) continue;
    el.classList.add("reveal");
    io.observe(el);
  }
}

/** A soft, slow-drifting wash behind the top of the page. */
export function addPageGlow() {
  if (document.querySelector(".page-glow")) return;
  const glow = document.createElement("div");
  glow.className = "page-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.prepend(glow);
}
