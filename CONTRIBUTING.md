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

## Accessibility checks

```bash
npm run build
npm run test:a11y     # axe-core across every built page — see scripts/a11y.mjs
```

Automated tools catch **roughly a third** of real accessibility problems. They
find missing labels, bad contrast and broken ARIA. They cannot tell you whether
the focus order makes sense, whether your alt text describes the right thing, or
whether a screen reader user can understand the page. The manual pass in
`docs/manual-a11y-test.md` is the part that matters. Run it before each launch.

## Images

Every image needs real alt text describing what matters about it, not the
filename. Decorative images get `alt=""`. Diagrams need either a text
description or a caption carrying the same information. The schema enforces a
minimum alt length so an empty string can't slip in by accident on a hero image.

Always set `width` and `height` so the page doesn't shift while loading.

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

Not set up yet. Planned: Cloudflare Pages from GitHub, preview build per pull
request. When it's done, this section gets the DNS steps.

The site URL lives in one place — `SITE` in `astro.config.mjs`. Change it there
and canonical URLs, the sitemap and RSS all follow.
