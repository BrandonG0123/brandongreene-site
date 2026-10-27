# brandongreene-site

The source for **brandongreene.dev**: Brandon Greene's portfolio and the dated build log
of his AI/ML independent study. Astro 7 static site, three.js, Motion. Readers are
teachers, his parents and, later, college admissions readers, so every claim on it gets
checked. `apps/footscan/` is a git subtree of the separate footscan repo, served on its
own subdomain.

Read `NEXT.md` (state and open questions), `CONTRIBUTING.md` (how to add content, the
motion rules, the honesty rules) and `DEPLOY.md` before changing anything.

## main is the live site

The server (tank) pulls `main` every few seconds and rebuilds, so **anything on main is
live on brandongreene.dev within seconds, before CI has run**. Work on a branch, open a
pull request, and never push to `main` yourself. Merging needs Brandon's go-ahead.

The site is hidden from search on purpose (fail-closed `noindex`). Only Brandon decides
when `PUBLIC_ALLOW_INDEXING=true` is set, and only on tank, after his parents have
reviewed the site.

## Honesty and privacy: not negotiable

- Never publish a number Brandon didn't give or that wasn't measured. No estimates
  written as results.
- Every decorative word (the kinetic band, the About intro's labels) is a claim, so it
  must be something he actually does.
- Group work says so and names his part. AI help a reader would want disclosed is
  disclosed.
- He is a minor publishing under his real name: no home address, phone, school name,
  school schedule, daily routine or location; no photos of other people. Contact is an
  alias on the domain, never his personal email.
- His foot scans never go on the site. Only the shoe and the calibration object may.
- The foot scanner is not a medical device and is never presented as one.

## Verify before calling work done

```bash
npm ci
npm run check                                  # astro check: types, content schema
npm run build
npm run test:a11y                              # axe: 7 pages x 2 themes x 3 viewports
node scripts/check-links.mjs --skip-external   # internal links (CI also checks external)
npm run test:budget                            # JS, CSS, font budgets
npm run test:tour                              # after touching src/scripts/tour.ts or the hero
```

`npm test` runs build + a11y + links (with external) + budget, which is what CI runs.
CI (`.github/workflows/ci.yml`) also runs Lighthouse (performance and accessibility at
least 95) and must be green on the pull request.

What a cloud sandbox can't check, so say so in your report instead of claiming it:

- **The live 3D.** Software WebGL (SwiftShader) is refused on purpose
  (`src/scripts/gpu.ts`), so cloud browsers and CI get the stills. The live hero shader
  and About intro only run on a real GPU: locally, Playwright with
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`.
- **Safari.** Mobile Safari behaviour (the guided scroll, taps, sound) is checked in the
  iOS Simulator on Brandon's Mac.
- **Stills.** `npm run render:about` should run on the Mac's GPU (see CONTRIBUTING.md,
  "Generated images").

## Rules for the work

- **Phones**: top-level pages are animation and short labels; paragraphs live one tap
  down (`src/scripts/phone-collapse.ts`). Keep new work to that.
- **Motion** follows CONTRIBUTING.md "Motion and 3D": progressive enhancement (no-JS,
  reduced motion and no-GPU all get a complete page), one Pause motion switch, nothing
  heavy at load, sound quiet and mutable. Animation must never look frozen: hold a moment
  with a slow drift, not a dead stop.
- **Design self-review** before showing anything visual: how does this improve the
  viewer's experience, what makes it unique rather than templated, what details can be
  added, and what does a casual viewer see in the first few seconds?
- `apps/footscan/` belongs to the footscan project (`BrandonG0123/footscan`). Don't edit
  it here.
- Write like the surrounding code: plain comments that explain why.

## Never commit

`deploy/deploy.env` (server address), any `.env`, Cloudflare Tunnel credentials,
`dist/`, `.astro/`, `.lighthouseci/`, `node_modules/`, scans of a person's foot, raw
serve footage, or Brandon's personal email.
