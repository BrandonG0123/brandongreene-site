# Working on this site

Notes to future Brandon. Written so you can come back after three months away
and not have to re-derive anything.

## Run it

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output into dist/
```

## Add a project

One markdown file. That's the whole job.

Create `content/projects/<slug>.md`. The filename becomes the URL:
`content/projects/foot-scanner.md` → `/projects/foot-scanner`.

```yaml
---
title: Foot scanner for custom orthopedic insoles
summary: One sentence — what it is and who it is for. This shows in the grid.
status: in-progress        # shipped | in-progress | planned
areas: [hardware, software, research]
started: 2026-09-11
updated: 2026-10-02        # optional; otherwise the latest log entry date is used
featured: true             # home page shows at most three
draft: false               # true = loud banner, noindex, hidden from all indexes
collaboration: solo        # solo | group
role: What you specifically did   # required in spirit whenever collaboration is group
aiAssisted: Used Claude for the mesh cleanup script   # optional, include if a reader would want it
links:
  - label: Repo
    href: https://github.com/you/thing
---
```

The schema is enforced at build time in `src/content.config.ts`. A missing
required field or a bad status fails the build rather than shipping quietly.

### The case study shape

Keep the same section order on every project, because consistency is what lets
somebody skim four of them:

1. One sentence — what it is and who for → the `summary` field
2. The problem, concretely
3. What I built — image, diagram or short video near the top
4. How it works — the technical core, for a smart non-specialist
5. Results and evidence — numbers, users, measurements
6. **What failed / what I'd do differently** — do not skip this one
7. Links

Wrap section 6 so it picks up the red markup styling:

```html
<section class="failure-section">

## What I'd do differently

Text here.

</section>
```

### Status rules

- **shipped** — someone can go and use it right now
- **in-progress** — genuinely unfinished; the build log carries the credibility
- **planned** — an intention. Gets one line on `/projects`, **no page**, and
  never appears in the main list or on the home page. This is deliberate.

## Placeholder slots

`content/projects/slot-*.md` are **layout slots, not projects**. They exist so
you can see how the list and the case study page behave with a realistic number
of entries instead of one.

They carry `placeholder: true`, and that flag is enforced by the build, not by
anyone remembering:

- `src/lib/visibility.ts` gates every project query on `import.meta.env.DEV`
- `import.meta.env.DEV` is **false in every `astro build`**
- so a production build emits no slot page, no index row, no home page entry,
  no sitemap URL and no RSS item

You cannot accidentally deploy one. Verify any time with:

```bash
npm run build && ls dist/projects/
```

Only real projects appear.

### Turning a slot into a real project

1. Replace `title`, `summary`, `areas`, `status` and `started`
2. Delete the `placeholder: true` line
3. Write the body using the case study shape above
4. Rename the file — the filename becomes the URL

Delete any slots you don't end up using. They cost nothing while they sit there,
but a folder of `slot-*.md` gets confusing after a year.

## Add a build log entry

Create `content/log/YYYY-MM-DD-short-slug.md`:

```yaml
---
title: What happened
date: 2026-10-02
project: foot-scanner   # optional; links the entry to a project page
---

What you actually did. Include the approaches that did not work — those are
the entries that make the log worth reading.
```

Entries linked to a project automatically appear on that project page and feed
the "N log entries" evidence on its status badge. They also go into `/rss.xml`.

**Write entries as they happen.** A log backfilled from memory in senior year is
worth much less than one written the week it happened, and it shows.

## Social cards

Every project gets a generated Open Graph card at `/og/<slug>.png`, plus a
default site card at `/og/default.png`. They are built by `src/lib/og.ts` —
the design brief's title block at 1200x630, so a link preview and the page
itself read as the same object.

You do not need to make images. Add a project and its card appears.

The card renders with satori, which cannot read woff2, so TTF copies of Fraunces
and IBM Plex Mono live in `assets/og-fonts/`. Those are build-time only — they
are never served to a browser and cost the page nothing.

Placeholder slots get no card, for the same reason they get no page.

## Generated images

These are rendered offline and committed, so nobody's browser has to do the
work:

```bash
npm run render:still     # hero gyroid still — rerun after changing gyroid.ts
npm run build && npm run render:models   # card stills of each project's 3D model
npm run render:icons     # iPhone home-screen icon — rerun after changing favicon.svg
npm run render:about     # About intro: poster, the five piece stills, and the
                         # calibration object's points — rerun after changing
                         # anything in src/scripts/intro/
```

The hero still is the same shader with the same uniforms as the live hero's first
frame, so the swap from still to live is seamless. Model stills are captured from
each project's real viewer.

## Motion and 3D, and the rules they follow

- Everything decorative is **progressive enhancement**: the page is complete with
  JavaScript off, and the animated versions only switch on once their script has
  actually started. Test with JavaScript disabled after any change.
- **prefers-reduced-motion** gets still frames, never animation.
- Anything that moves on its own for more than 5 seconds has a visible pause
  control (WCAG 2.2.2).
- The one exception is the reader's own request: "See the work" walks down
  through the serve at reading pace (`src/scripts/tour.ts`). The reader started
  it, and any scroll, tap or click stops it on the spot; a key skips to the end.
  Tune the pace with the constants at the top of that file, not by shortening
  the holds until the sentences can't be read.
- Content is never hidden behind a reveal that might not fire. Reveals trigger
  when *any* part of the element is in view; a percentage threshold on a tall
  element can never be met on a short screen.
- Nothing heavy runs at load: the hero shader waits for first interaction; the
  three.js viewer loads by dynamic import near the viewport.
- The About intro (`src/scripts/intro/`) is the other exception to "nothing
  moves on its own": about 10 seconds, once per visit (`PACE` at the top of
  `index.ts` sets the speed of the whole score, sound included). **Skip intro** comes first
  in the tab order, and any key, wheel, touch or click on the stage skips it.
  Once the pieces settle, nothing moves unless the reader is pointing at it.
  Its setup runs in short steps that yield to the browser (each leaves an
  `intro:<step>` performance mark), so it never blocks the page.
- **Sound is quiet, and stoppable at once.** The intro's effects (`sound.ts`)
  are synthesised in the browser from the same clock as the picture: no files,
  nothing to license. They play by themselves at a low level when the browser
  allows a page to start sound (often only after the visitor has clicked
  something on the site). Otherwise "Play with sound" starts them. "Mute" is on
  screen from the first frame (WCAG 1.4.2), and a reader who mutes stays muted
  on later visits.
- **A real GPU, or the still.** `failIfMajorPerformanceCaveat` is not enough on
  its own: current Chromium hands SwiftShader (CPU rendering) a context even
  with it set. `src/scripts/gpu.ts` (and the About page's inline check) also
  reject software renderers by name. Headless CI browsers therefore get the
  stills, so the 3D never shows up in CI's axe or Lighthouse runs. Test the live
  path locally with Playwright and
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, which uses the Mac's GPU.
- New decorative text (the kinetic band, the wordmark) is still a claim. Every
  word must be something Brandon actually does.

## Checks

```bash
npm test                  # build + a11y + links + budget. What CI runs.

npm run test:a11y         # axe-core, every page x 2 themes x 3 viewports
npm run test:links        # every internal and external link resolves
npm run test:budget       # JS under 100 KB, fonts and CSS in check
npx lhci autorun          # Lighthouse: accessibility and performance >= 95
```

All of these run on every push and every pull request
(`.github/workflows/ci.yml`). A violation fails the build — nothing is advisory.

CI also asserts that no placeholder slot reached `dist/`, as a second lock on
top of the `import.meta.env.DEV` gate in `src/lib/visibility.ts`.

Automated tools catch **roughly a third** of real accessibility problems. They
find missing labels, bad contrast and broken ARIA. They cannot tell you whether
the focus order makes sense, whether your alt text describes the right thing, or
whether a screen reader user can understand the page. The manual pass in
`docs/manual-a11y-test.md` is the part that matters. Run it before each launch.

## Images

Put the file next to the markdown, in `content/projects/`, and reference it
relatively:

```yaml
hero:
  src: ./scanner-rig.jpg
  alt: The scanning rig on a desk, a phone clamped above a foot on a turntable
  caption: First working version of the rig, Oct 2026
```

Astro generates AVIF and WebP with a JPEG fallback at 1x and 2x for the reading
column, and reads the real dimensions out of the file so `width` and `height`
are never typed by hand and never wrong. **Do not set width/height yourself** —
that is what actually prevents layout shift, and a hand-typed number drifts the
moment you swap the image.

Alt text must describe **what matters about the image**, not the filename. The
schema rejects anything under 12 characters, so an empty or lazy string cannot
slip onto a hero by accident. Decorative images get `alt=""`. Diagrams need
either a text description or a caption carrying the same information — a
screen reader user should get what a sighted reader gets.

## Honesty rules

These are constraints, not style preferences. This site represents you to
institutions that can and do check things.

- Never publish a number you did not measure. No estimates dressed as results.
- Group work says it's group work, and names your specific contribution.
- AI assistance a reader would want disclosed, gets disclosed.
- If a link doesn't resolve, remove it. Don't leave it pointing at nothing.
- No home address, no phone number, no school schedule, no daily routine.
- Contact is an alias, never your personal email in plain text.

## Deploy

See [DEPLOY.md](DEPLOY.md) — domain, GitHub, Cloudflare Pages, DNS, and the
pre-launch checklist.

The site URL lives in one place: `SITE` in `astro.config.mjs`. Canonical URLs,
the sitemap, RSS, robots.txt and the résumé header all derive from it.

**The site is hidden from search by default** — every page sends `noindex` and
robots.txt serves `Disallow: /`. Launching means building with
`PUBLIC_ALLOW_INDEXING=true`, set wherever the build runs (on tank, that's the
scheduled build task). It fails closed deliberately; see DEPLOY.md step 5.
