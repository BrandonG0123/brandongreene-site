// On-screen pieces shared by the customer scan page and the studio's research
// capture: the steering arrow and the sound toggle.
const $ = (id) => document.getElementById(id);

const ARROW = '<path d="M50 8 L78 52 H62 V88 H38 V52 H22 Z"/>';
// A tick in a ring: "you're in the right place", which an arrow can't say.
const HOLD = '<circle cx="50" cy="50" r="36" fill="none" stroke-width="10"/><path d="M33 51 L45 63 L68 38" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>';

/**
 * Big arrow on the camera view: which way to move next.
 * Hidden while something else needs fixing first (too dark, blurry, mat out of
 * view), so the screen never shows two instructions that disagree.
 */
export function renderSteer(s, scanner) {
  const arrow = $("steer"), label = $("steer-text");
  const problem = !s.sharp.ok || !s.exposure.ok || (scanner.requireMat && !s.matVisible);
  const show = scanner.capturing && s.hasView && !s.done && !problem && (s.steer.angle != null || s.steer.arrived);
  arrow.hidden = !show;
  label.hidden = !show;
  if (!show) return;
  const svg = arrow.firstElementChild;
  const mode = s.steer.arrived ? "hold" : "arrow";
  if (svg.dataset.mode !== mode) {
    svg.innerHTML = mode === "hold" ? HOLD : ARROW;
    svg.dataset.mode = mode;
  }
  arrow.classList.toggle("arrived", s.steer.arrived);
  if (s.steer.angle != null) {
    // Sit toward the edge it points at, so the arrow never covers the subject.
    const rad = (s.steer.angle * Math.PI) / 180;
    arrow.style.transform = `translate(${(Math.sin(rad) * 26).toFixed(1)}%, ${(-Math.cos(rad) * 22).toFixed(1)}%)`;
    svg.style.transform = `rotate(${s.steer.angle.toFixed(0)}deg)`;
  } else {
    arrow.style.transform = "none";
    svg.style.transform = "none";
  }
  label.textContent = s.steer.text;
}

const SPEAKER = {
  on: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

export function wireSoundToggle(scanner) {
  const btn = $("btn-sound");
  const paint = () => {
    // An inline icon, not an emoji: emoji fall back to a missing-glyph box on iOS.
    btn.innerHTML = scanner.cues.enabled ? `${SPEAKER.on} Sound on` : `${SPEAKER.off} Sound off`;
    btn.setAttribute("aria-pressed", String(scanner.cues.enabled));
  };
  btn.onclick = () => {
    scanner.cues.enabled = !scanner.cues.enabled;
    scanner.cues.save();
    if (scanner.cues.enabled) scanner.cues.start();
    else globalThis.speechSynthesis?.cancel?.();
    paint();
  };
  paint();
}
