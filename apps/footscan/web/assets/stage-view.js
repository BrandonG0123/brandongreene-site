// Fullscreen / minimised camera stage, like a video player.
//
// Scanning wants the whole screen: you are holding the phone over a foot and
// the guidance has to be readable at arm's length. But you also need to get
// back to the page (instructions, scale reading, the rest of the flow)
// without losing the camera, so minimising parks it in the corner and keeps
// the scan running.
//
// iOS Safari only allows the native Fullscreen API on video elements, so this
// is done with CSS instead: it behaves the same everywhere, including in
// standalone web apps.
//
// Modes: "inline" (in the page), "full" (covers the screen), "mini" (corner).

const ICONS = {
  minimize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14h5v5M19 10h-5V5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 20h5v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/**
 * stage: the camera container. hud: controls to keep with the camera.
 * docked: overlay elements (guidance, badges) that should sit above the
 * controls in fullscreen instead of floating over them.
 */
export function createStageView(stage, hud, { docked = [], onModeChange = () => {} } = {}) {
  const moved = [...docked, hud].filter(Boolean).map((el) => {
    const anchor = document.createComment("stage-slot");
    el.parentNode.insertBefore(anchor, el);
    return { el, anchor };
  });

  const dock = document.createElement("div");
  dock.className = "stage-dock";

  const buttons = document.createElement("div");
  buttons.className = "stage-buttons";
  const btn = (name, label, icon) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `stage-btn stage-btn-${name}`;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = icon;
    buttons.append(b);
    return b;
  };
  const minimizeBtn = btn("minimize", "Minimise the camera", ICONS.minimize);
  const expandBtn = btn("expand", "Back to full screen", ICONS.expand);
  const closeBtn = btn("close", "Put the camera back in the page", ICONS.close);
  stage.append(buttons);

  let mode = "inline";

  function apply(next) {
    mode = next;
    stage.classList.toggle("is-full", mode === "full");
    stage.classList.toggle("is-mini", mode === "mini");
    document.body.classList.toggle("stage-locked", mode === "full");
    minimizeBtn.hidden = mode !== "full";
    expandBtn.hidden = mode !== "mini";
    closeBtn.hidden = mode !== "mini";
    // The controls and guidance follow the camera into fullscreen, so Start,
    // Pause and Finish stay reachable and nothing overlaps.
    for (const { el, anchor } of moved) {
      if (mode === "full") dock.append(el);
      else anchor.parentNode.insertBefore(el, anchor);
    }
    if (mode === "full") stage.append(dock);
    else dock.remove();
    onModeChange(mode);
  }

  minimizeBtn.addEventListener("click", () => apply("mini"));
  expandBtn.addEventListener("click", () => apply("full"));
  closeBtn.addEventListener("click", () => apply("inline"));
  stage.addEventListener("click", (e) => {
    if (mode === "mini" && !e.target.closest(".stage-btn")) apply("full");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode === "full") apply("mini");
  });

  apply("inline");
  return {
    get mode() { return mode; },
    full: () => apply("full"),
    mini: () => apply("mini"),
    inline: () => apply("inline"),
    destroy: () => {
      apply("inline");
      buttons.remove();
      moved.forEach(({ anchor }) => anchor.remove());
    },
  };
}
