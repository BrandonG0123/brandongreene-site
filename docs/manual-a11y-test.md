# Manual accessibility test script

Run this before every launch and after any layout change.

**Read this first:** axe-core passing means very little on its own. Automated
tooling catches roughly a third of real accessibility problems — it finds
missing labels, contrast failures and malformed ARIA. It cannot tell you whether
the tab order is sensible, whether your alt text describes the right thing, or
whether the page is comprehensible without sight. The passes below are the part
that actually matters.

Time: about 20 minutes for the whole site.

---

## Pass 1 — Keyboard only

Put the mouse somewhere you can't reach it. Then, on every page:

| Step | Expected |
|---|---|
| Load the page, press `Tab` once | "Skip to content" appears with a visible outline. It must be **visible** — if you can't see where focus is, that's a failure. |
| Press `Enter` on it | Focus moves to the main content, not the top of the page |
| `Tab` through the header | Brand → each nav link → theme toggle. Focus ring visible at every stop, in both themes. |
| `Enter` on the theme toggle | Theme flips. Focus stays on the button. Label changes to the other theme's name. |
| `Tab` through `/projects` filters | Each filter button reachable. `Enter` or `Space` activates it. |
| Activate a filter | The list changes. The pressed button is distinguishable **without relying on colour** — check by squinting or in greyscale. |
| Keep tabbing to the end | Focus never jumps somewhere unexpected, never gets trapped, never disappears behind a sticky element. |
| `Shift+Tab` back up | Order is the exact reverse. No skipped stops. |

Fail conditions: any focusable thing with no visible focus indicator; any
control you can reach with a mouse but not the keyboard; focus moving somewhere
that doesn't match the visual order.

## Pass 2 — Screen reader

macOS VoiceOver: `Cmd+F5` to toggle. `Ctrl+Option+→` to move by element.
`Ctrl+Option+U` opens the rotor. Windows NVDA: `Insert+↓` to read, `H` to jump
by heading, `Insert+F7` for the elements list.

### Landmarks
Open the landmarks rotor on any page.

- Expected: `banner`, `navigation "Main"`, `main`, `contentinfo`
- One `main` per page, and nothing important living outside a landmark

### Headings
Open the headings rotor on `/projects/foot-scanner`.

- Expected, in this order: `Foot scanner for custom orthopedic insoles` (h1) →
  `The problem` (h2) → `Where it stands` (h2) → `What I'm figuring out` (h2) →
  `Honest scope` (h2) → `Build log` (h2) → the entry title (h3) →
  `Project details` (h2)
- Exactly one h1. No level is skipped anywhere.

### Status badge
Navigate to the status badge on any project.

- Expected announcement: **"In progress"** — as text
- Fail: the status being conveyed only by the square's colour or fill. Read it
  in greyscale too: shipped is filled, in progress is half-filled, planned is
  hollow, and each carries its word.

### Theme toggle
Navigate to it in the header.

- Expected: announced as a **button**, with its label, and a pressed state
- Activate it: the label changes to the opposite theme

### Filters on `/projects`
Tab to the filter group and activate a filter.

- Expected: group announced via its "Filter by area" label
- Each button announces as a button with a pressed/not-pressed state
- **After activating:** the live region announces
  "Showing 1 of 1 projects in hardware." If nothing is announced, the filter is
  invisible to a screen reader user — that's a failure even though axe passes.

### Images
Navigate to every image on the site.

- Each announces alt text that describes **what matters about it**
- Decorative images are skipped entirely (`alt=""`)
- Fail: hearing a filename, "image", or a description that doesn't say the thing
  the image is there to communicate

### Links
Open the links rotor.

- Every link makes sense read out of context
- Fail: more than one "Read more" / "here" / "click here"

## Pass 3 — Zoom and reflow

| Step | Expected |
|---|---|
| Browser zoom to 200% | Everything readable, nothing clipped or overlapping |
| Zoom to 400%, window at 1280px wide | Single column, **no horizontal scrolling**. Only tables, diagrams and code blocks may scroll sideways, each in their own container. |
| Narrow to 320px | Same. The project margin rail appears below the content rather than vanishing. |
| Text-size-only zoom to 200% | Layout holds; nothing is clipped |

## Pass 4 — Themes and motion

| Step | Expected |
|---|---|
| Switch OS to dark mode with no manual override set | Site follows the OS |
| Set a manual theme, reload | Choice persists |
| Private browsing window | Site still loads and the toggle still works for that page view (storage is blocked there) |
| Enable "Reduce motion" in OS settings | No animation runs. Nothing depends on motion to be understood. |
| View both themes in greyscale | No information is lost. Status is still readable. |

## Pass 5 — Print

| Step | Expected |
|---|---|
| Print preview `/resume` | **One page.** Header, footer and theme toggle gone. No URL clutter appended to links. |
| Print preview a project page | Readable in black on white; external link URLs shown in full so they're usable on paper |

---

## Log your run

Date, browser, screen reader, and anything you found. A test you didn't record
is a test you'll redo.

| Date | Browser / SR | Result | Notes |
|---|---|---|---|
| | | | |

---

## Device matrix

Checked on 2026-09-23 with emulated viewports. Re-run after any layout change.

| Device | Width | Layout | Chars/line |
|---|---|---|---|
| iPhone (small) | 320 | single column | 33 |
| iPhone 16 | 393 | single column | 41 |
| iPad mini portrait | 744 | single column, centred | 65 |
| iPad Air portrait | 820 | single column, centred | 65 |
| iPad Air landscape | 1180 | two column, rail left | 65 |
| MacBook | 1440 | two column, rail left | 65 |

At every width: no horizontal scroll, no element wider than the viewport, and
no interactive target under 24×24px. Touch devices get 44px.
