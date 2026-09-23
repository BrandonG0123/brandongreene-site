# Where we stopped — 23 Sept 2026

Picking this back up: read this file first, then `CONTRIBUTING.md` and
`DEPLOY.md`.

## State

Site is built, verified, and committed. Nothing is deployed. Last commit
`bfd27ea`. No git remote yet.

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

## Verified, last run

| Check | Result |
|---|---|
| axe-core | 42 page checks, **0 violations** |
| Lighthouse | **100 / 100 / 100 / 100** on all six pages, 0 console errors |
| LCP | 445 ms worst case (budget 2000) |
| CLS | 0.000 |
| JS | 5.9 KB total, all inline (budget 100 KB) |
| Links | 14 internal, all resolve |
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
3. **Deploy** — `DEPLOY.md` has the full walkthrough. Blocked on Brandon:
   needs his GitHub account, a Cloudflare account, and a domain purchase.
   Recommended: deploy with `PUBLIC_ALLOW_INDEXING=false` so it can be tested
   on a real phone without being indexed while the fill-in markers are still
   there.
4. **Manual accessibility pass** — `docs/manual-a11y-test.md`. Automated tooling
   catches about a third of real issues; this is the part that matters.
5. Generated OG image per project (not built yet).
6. Delete unused `slot-*.md` files once real projects replace them.

## Open questions for Brandon

- GitHub username
- Domain choice — `.com`/`.net`/`.me` are taken; `.dev`, `.io`,
  `brandon-greene.com` appeared free on 18 Sept 2026. Re-check before buying.
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
