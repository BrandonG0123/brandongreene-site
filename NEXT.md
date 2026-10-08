# Where we stopped — 8 Oct 2026

Picking this back up: read this file first, then `CONTRIBUTING.md` and
`DEPLOY.md`.

## State

Site is built, verified, and pushed to github.com/BrandonG0123/brandongreene-site
(main). **Deploys are automatic:** tank pulls `main` every few seconds and
rebuilds, so a push is live on brandongreene.dev almost at once, before CI has
finished. Verify locally before pushing. (Manual steps, if ever needed, are in
`DEPLOY.md`.)
For the latest state run `git log --oneline`.

```bash
cd /Users/bgreene/code/brandongreene-site
npm install          # if node_modules is gone
npm run dev          # http://localhost:4321
npm test             # build + axe + links + budget
npx lhci autorun     # Lighthouse
```

## Done

- **Pages**: home, `/projects`, `/projects/<slug>`, `/about`, `/log`,
  `/resume`, 404. RSS, sitemap, generated robots.txt, canonical URLs,
  Person + CreativeWork structured data.
- **Design**: built to `content/notes/design-brief.md` — drawing-sheet layout
  with a margin rail, Fraunces / Atkinson Hyperlegible Next / IBM Plex Mono
  self-hosted (152 KB, 4 faces), verified-contrast palette, light and dark
  themes following the OS.
- **Status system**: Shipped / In progress / Planned as shape + label + colour.
  Planned gets one line and no page.
- **Placeholders**: six `content/projects/slot-*.md` layout slots, dev-only by
  construction (`src/lib/visibility.ts` gates on `import.meta.env.DEV`).
  CI additionally asserts none reached `dist/`.
- **CI** (`.github/workflows/ci.yml`): axe-core over every page × 2 themes ×
  3 viewports, link resolution, performance budget, Lighthouse ≥ 95.
  All failing builds, nothing advisory.
- **Social cards**: generated per project at `/og/<slug>.png` plus a site
  default, built by `src/lib/og.ts`. `og:image` and `twitter:image` wired, and
  the link checker validates those URLs resolve.
- **Favicon** and theme-color.
- **Self-hosted deploy**: `scripts/deploy.sh` (build → verify → rsync, with a
  placeholder guard), `deploy/Caddyfile` and `deploy/nginx.conf`, and a
  Cloudflare Tunnel setup in `DEPLOY.md`. Build-time `PUBLIC_ALLOW_INDEXING` (fails closed: hidden unless `=true`)
  switch verified in both directions.
- **Responsive images**: hero images use Astro's asset pipeline — AVIF and WebP
  with a JPEG fallback at 1x and 2x, dimensions read from the file so they
  cannot be wrong. Verified end to end with a test image, which was then
  removed. Drop a photo next to the markdown and it works.

## The futuristic redesign (7 Oct 2026)

Brandon asked for a full-futuristic, animated, 3D site. Built on a branch, reviewed,
then merged to main.

- **Look**: near-black ground, electric ice (#4DF3FF) with violet in the 3D, and
  optic yellow (#D4FF3A, the tennis-ball colour) reserved for the ball. Unbounded
  for display; Atkinson Hyperlegible Next stays for body text. The old vellum
  design survives intact as an opt-in "Reading mode".
- **Home, in acts**: gyroid hero → scroll-scrubbed serve → kinetic type band →
  project cards with hologram stills → build-log timeline → closing section.
- **Gyroid hero** (`src/scripts/gyroid.ts`): raymarched in one shader. Shows a
  pre-rendered still at load; the live shader starts on first interaction, and
  refuses software WebGL. `npm run render:still` regenerates the still.
- **Serve** (`ServeChapter.astro`, `scripts/serve.ts`): shows an illustrative,
  hand-keyframed serve labelled "Illustration · not footage" on the stage, with
  no measured numbers, until `public/serve/pose.json` (real pose data from
  Brandon's own footage) exists; then it switches to real mode with joint-angle
  telemetry. Brandon's decision, 7 Oct 2026. Three explicit states: no-JS,
  reduced motion, live.
- **3D model viewer** (`ModelViewer.astro`, `scripts/viewer.ts`): three.js, lazy
  loaded, follows the mouse, keyboard-operable. Card stills via
  `npm run render:models`.
- **Motion** (motion.dev) drives scroll-linked and spring animation.
- **About opening, "Orbit" (8 Oct, on branch `claude/confident-curie-7t6jj7`,
  not merged)**: replaces "Ignition". `src/components/AboutIntro.astro`,
  `src/scripts/orbit/`, the film in `video/`. A real tennis ball takes the hit,
  catches fire and is scanned into points (a 3.8 s film, rendered from the same
  scene code as the page); the points print six pieces round a ring (Tennis,
  School, Projects, Coding, Hobbies, Mind); threads of light carry them back to
  the centre, a spiral staircase: self-improvement. Then the ring is the
  navigation: each category opens into its items on hover, focus or tap, Tennis
  open by default. About 12 s, once per visit, skippable, Replay afterwards.
  Reduced motion, no capable GPU, or no JS: the same map as tiles with stills
  (`npm run render:about`). The film: `npm run render:film` (Remotion; minutes
  on the Mac). The brief, interview and treatment are in the claude-learning
  repo (`about-animation/`), with the overnight review log
  (`about-animation/review-log.md`) and the tools that recorded it
  (`tools/review.mjs` records the built page frame by frame with its sound,
  `tools/sound.mjs` measures the sound's loudness, `tools/film.mjs` renders
  the film without a GPU). While the film is on screen a small credit says
  "Illustration · rendered, not filmed". When a ripple runs out to the ring
  (8.05 s), the staircase is done.
- **Phones (7 Oct)**: top-level pages are pictures and short labels; the
  paragraphs live one tap down (folding sections on About and the Build log,
  `src/scripts/phone-collapse.ts`), and the articles use a smaller phone type
  scale. Checked in mobile Safari on the iPhone simulator.
- **The About film** now lives in this repo (`video/`), rendered from the
  page's own scene code; `~/code/about-film` is superseded.
- **Details, self-review round (7 Oct)**: chapter rail on wide screens (Origin /
  Work / Build log / Elsewhere, scroll-spy); case studies get "On this page", a
  reading time and a pinned 3D viewer beside the text; a tape measure runs
  through the word band; the 404 is a line call ("Out."); the favicon is an
  optic-yellow ball, with an iPhone icon from `npm run render:icons`; links in
  text get a hairline underline that drops on hover.

## Verified, last run

| Check | Result |
|---|---|
| axe-core | 42 page checks (7 pages × 2 themes × 3 viewports), **0 violations** |
| Lighthouse (launch mode) | performance 99–100, a11y / best practices / SEO 100, all six pages × 3 runs |
| TBT | 7 ms worst case |
| LCP | 539 ms worst case (budget 2000) |
| CLS | 0.019 home, 0.001 or less elsewhere (budget 0.1) |
| JS | critical 84 KB on home (budget 100); 3D viewer is a 157 KB-gzip lazy chunk (budget 200) |
| CSS | budgeted per page now (render-blocking, 60 KB): heaviest is home at 48.9 KB. It used to be one site-wide total, which charged every page for the About intro's styles |
| Links | 32 internal, all resolve (incl. social cards) |
| Reduced motion / no JS | nothing moves on its own; everything readable without JS |

## Next, in order

1. **Content interview, rounds 2 and 3.** This is the actual bottleneck —
   everything else is machinery waiting on it.
   - The foot scanner specifics: origin, scanning approach, where ML fits,
     what exists after N weeks, how accuracy gets measured, what's failed.
     Open questions are listed in `content/projects/foot-scanner.md`.
   - The other projects Brandon has started but hasn't described.
   - Tennis and chess for `/about` — level, years, results.
   - Résumé facts.
2. **Fill the `[To fill in: ...]` markers** on `/about` and `/resume`. These are
   real page content and would be publicly visible.
3. **Deploy** — self-hosted on Brandon's own machine (the one running his
   Minecraft server), fronted by a Cloudflare Tunnel so his home IP stays out
   of public DNS. `DEPLOY.md` is the full walkthrough; `npm run deploy` builds,
   verifies and rsyncs. Still needs from Brandon: the domain (one line in
   `astro.config.mjs`), and the server prepared per DEPLOY.md steps 2-3.
   The site is hidden from search by default. Launch = build with
   `PUBLIC_ALLOW_INDEXING=true`, only after the fill-in markers are gone.
   Known and accepted: the machine goes down roughly weekly. Brandon plans to
   fix that; until then the URL should not go anywhere that gets one shot.
4. **Manual accessibility pass** — `docs/manual-a11y-test.md`. Automated tooling
   catches about a third of real issues; this is the part that matters.
5. Delete unused `slot-*.md` files once real projects replace them.
6. Add real images to the foot scanner page once there is something to
   photograph. The pipeline is built and verified — see CONTRIBUTING.md.

## Open questions for Brandon

- **The AI disclosure line in the footer** — drafted, not approved. It reads:
  "Designed and coded with substantial help from Claude, an AI model. The
  projects are mine, and every claim on this site is checked against them."
  His rule requires disclosure; the exact words are his call.
- **Serve footage** — film it (tripod, side-on, slo-mo, nobody else in frame, no
  recognisable court), then run pose estimation to produce `pose.json`. The
  illustration is live until then.
- **footscan portfolio export** — the prompt is at `~/code/footscan-portfolio-prompt.md`;
  the case study's phase table is now out of date (Phases 2–3 are built).
- **About opening: what's still a stand-in** (Brandon to provide; nothing waits on it):
  - **Voiceover**, drafted from his words: "I'm Brandon. Tennis, school, the
    things I build, the mountains and the water. All of it comes back to one
    thing: getting better." The slot appears once two files exist:
    `public/about/voiceover.m4a` (Voice Memos is fine) or `.mp3`, and
    `public/about/voiceover.vtt` (captions, which also become the transcript).
    It starts 0.4 s in (`SCORE.voice`). The picture: hit 0–1.1, fire 1.1–2.7,
    scan 2.7–3.8, the ring printing 4.2–6.5, threads to the centre 6.4–8.0,
    Tennis opens 8.5, title 9.9, settled 11.6. Keep it free of school, location
    or schedule details; parents review it before launch.
  - **Piano**: the music under it is a synthesised stand-in. Four to eight bars
    of his own playing replace it; it must be his own music or out of copyright.
  - **Sounds**: all synthesised. His recordings (racquet hits, ball bounces)
    can replace the hit; CC0 library sounds need kenney.nl or freesound.org
    allowed in the cloud environment's network settings.
  - **Footage**: tennis, skiing, surfing, hiking, biking clips and photos, via a
    shared Google Drive folder. Each frame gets the privacy check. They go into
    the pieces' item lists (and his serve can cut into the film's opening).
  - **Item labels** are drafts from his words; **GPA** and **course names** for
    the School section are his to give (TO CONFIRM; nothing published until he does).
- **Home: hero button contrast (pre-existing, also on main).** `npm run
  test:a11y` fails on `/` at the tablet viewport, both themes: axe says the
  "See the work" `.btn--primary` (src/components/Hero.astro, styles in
  src/styles/global.css) is under 4.5:1, flakily (1–3 violations between runs),
  so it may be an animation mid-flight when axe samples it. Because `npm test`
  chains the checks, it stops the link and budget checks from running (run
  them on their own meanwhile). Needs its own fix; never by disabling the rule.
- **Lighthouse (pre-existing, same on main, 8 Oct):** the home page scores 0.84
  for performance with a layout shift of 0.31 (budget 0.1), and the foot
  scanner case study 0.92–0.94 with about 210 ms of blocking time. /about
  scores 100 / 100 / 100 (LCP 0.43 s, no shift, no blocking time); every page's
  SEO is 0.66 only because unlaunched builds are `noindex`.
- **About opening links** — Tennis, School, Coding, Hobbies, Mind and
  Self-improvement go to their sections on /about until their own pages exist;
  Projects and its items go to /projects, the foot scanner and the log.

- Contact method — leaning an alias on the domain. Personal email must never
  appear in plain text.
- Exact start date of the independent study. The log currently says
  11 Sept 2026, inferred from "last week" said on the 18th. Needs confirming —
  the log is only worth something if the dates are real.
- Whether the CS teacher supervising the study wants to be named on the site.
- When the teacher wants the site done (Brandon said "no hard deadline" but
  also that the site is a deliverable of the study — those conflict).

## Standing constraints

- Never publish a number Brandon didn't give. No estimates written as results.
- Group work labelled as group work, with his specific contribution named.
- No home address, phone number, school schedule or daily routine.
- Brandon is a minor publishing under his real name — parents should see the
  site before it becomes indexable.
- Insoles are medical-adjacent: the site may describe a scanning and
  fabrication pipeline, but must not claim medical efficacy or fit accuracy
  that hasn't been measured.
