# Where we stopped — 7 Oct 2026

Picking this back up: read this file first, then `CONTRIBUTING.md` and
`DEPLOY.md`.

## State

Site is built, verified, and committed. Nothing is deployed, and there is no
git remote yet — see `DEPLOY.md`. For the latest state run `git log --oneline`.

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
- **Serve** (`ServeChapter.astro`, `scripts/serve.ts`): production shows only the
  ball's arc until `public/serve/pose.json` (real pose data from Brandon's own
  footage) exists. Dev shows a synthetic serve, labelled. Three explicit states:
  no-JS, reduced motion, live.
- **3D model viewer** (`ModelViewer.astro`, `scripts/viewer.ts`): three.js, lazy
  loaded, follows the mouse, keyboard-operable. Card stills via
  `npm run render:models`.
- **Motion** (motion.dev) drives scroll-linked and spring animation.

## Verified, last run

| Check | Result |
|---|---|
| axe-core | 42 page checks, **0 violations** |
| Lighthouse | **100 / 100 / 100 / 100** on all six pages, 0 console errors |
| LCP | 445 ms worst case (budget 2000) |
| CLS | 0.000 |
| JS | 5.9 KB total, all inline (budget 100 KB) |
| Links | 17 internal, all resolve (incl. social cards) |
| Reflow | no horizontal scroll at 320–1440 |
| Line length | 65 characters at iPad mini, iPad landscape and 1440 Mac |

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
  recognisable court), then run pose estimation to produce `pose.json`.
- **footscan portfolio export** — the prompt is at `~/code/footscan-portfolio-prompt.md`;
  the case study's phase table is now out of date (Phases 2–3 are built).

- GitHub username
- **The domain.** Brandon has registered one but hasn't said which. It is a
  one-line change: `SITE` in `astro.config.mjs`. Everything else derives from it,
  including the Caddyfile/nginx server_name which must match.
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
