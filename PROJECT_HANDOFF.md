# PROJECT_HANDOFF: brandongreene-site → Claude Code Project

Prepared 27 Oct 2026 from a local Claude Code session (the desktop app's Code tab on
Brandon's Mac), checked against git, the code and the files on disk rather than memory.
Anything that couldn't be confirmed is marked **UNVERIFIED**. No secret values appear
anywhere in this file. This repository is public, so this file says nothing the site and
`NEXT.md` don't already say publicly.

Branch: `project-handoff/site` (based on `main` at `248eb5a`). It adds two files at the
repo root, this one and `CLAUDE.md`. The site build reads only `src/`,
`content/projects/` and `content/log/`, so neither file can reach brandongreene.dev.

## A. Project

**Name:** brandongreene-site

**Goal:** finish and launch brandongreene.dev, Brandon's portfolio and the dated build
log of his AI/ML independent study, so that every claim on it is true and checked and it
goes public only when he and his parents approve.

## B. Context to add

### Repositories

| Repository | Add to the project? | Notes |
|---|---|---|
| `BrandonG0123/brandongreene-site` | **Yes**: nearly every task | Public. Default branch `main`, which the server tank deploys within seconds. |
| `BrandonG0123/footscan` | No (named in the instructions) | Same GitHub owner, so a thread can add it to itself (for example, to refresh the foot-scanner case study from it). It has **its own Project handoff** on its branch `project-handoff/footscan`; run it as a separate project, not inside this one. |
| about-film (`~/code/about-film`) | No | **Not on GitHub**: the local repo has no remote, and `github.com/BrandonG0123/about-film` doesn't exist. It's the separate About-film project (Remotion, run on Fable). If you want a project to use it, create the GitHub repo yourself and push it first. |

All repositories here have the same owner (`BrandonG0123`), so there's nothing under a
different owner for you to add by hand.

### Files to upload to the Library (not in git)

None is over 30 MB, so the New project dialog or the Library tab both work. There are no
folders to upload.

| File | Size | Why |
|---|---|---|
| `PROJECT_HANDOFF.md` (this file) | ~25 KB | Every thread can read it at `/mnt/project-files/`. |
| `~/code/about-me-brief.md` | 4.7 KB | Facts about Brandon for any content or animation task. **Partly stale**: it says tennis, chess and the study's start date aren't on record yet. Those were settled on 15 Oct (see D). Backlog task F4 refreshes it. |
| `~/code/footscan-portfolio-prompt.md` | 7.4 KB | The brief for refreshing the foot-scanner case study (F2). |
| `~/code/about-animation-prompt.md` | 17 KB | Optional: the brief for the next About animation, if this project integrates it (F10). |
| `~/code/about-film-prompt.md` | 10.7 KB | Optional: the About film brief, same reason. |

Don't upload these. They're private or not needed:

- footscan's `data/captures/` (scans of Brandon's foot: personal data, 56 MB in 8 captures);
- footscan's `.studio_key` and `.certs/`;
- `deploy/deploy.env`;
- `~/code/WORK-SUMMARY.md`, which is a 1 Oct snapshot that's now out of date.

## C. Project instructions

Paste everything inside the block into **Project settings > Memory > Project
instructions**.

```text
This project finishes and launches brandongreene.dev: Brandon Greene's portfolio and the dated build log of his AI/ML independent study. Its readers are teachers, his parents and, later, college admissions readers. Brandon is a high-school student: explain things in plain words, and tell him straight when something isn't possible, with the nearest thing that is.

The full handoff is at /mnt/project-files/PROJECT_HANDOFF.md (also at the root of the repo). The repo's own rules are in CLAUDE.md, NEXT.md, CONTRIBUTING.md and DEPLOY.md.

REPOS AND BRANCHES
- BrandonG0123/brandongreene-site. Base branch: main. main is the live site: the server pulls it every few seconds, so anything merged is public within seconds, before CI has run. Never push to main.
- One branch per task, named site/<short-topic>, started from main. When the work is verified, open a pull request to main whose title says what changes for someone reading the site.
- BrandonG0123/footscan is a separate project with its own handoff. Add it to a thread only to read from it (for example, for the foot-scanner case study). Never push to it from this project. apps/footscan in the site repo is a git subtree that project owns: don't edit it here.
- about-film is a separate project and isn't on GitHub. If a task needs it, stop and say so.

VERIFY BEFORE CALLING WORK DONE
Run these in the repo and report the results:
  npm ci
  npm run check
  npm run build
  npm run test:a11y
  node scripts/check-links.mjs --skip-external
  npm run test:budget
  npm run test:tour        (only after touching src/scripts/tour.ts or the hero)
Then push and wait for CI on the pull request (axe, links including external ones, budgets, Lighthouse >= 95). A task isn't done while CI is red.
Cloud browsers have no GPU, and the site refuses software WebGL on purpose, so in a cloud thread you see the stills, never the live 3D (the hero shader and the About intro). Safari is checked in the iOS Simulator on Brandon's Mac. When a change touches either, say plainly in your report what you couldn't check and list it as a local check for Brandon. Never claim a check you didn't run.
Doc-only changes still run npm run check and npm run build.

HOW TO WORK
- Commit and push work in progress to your branch often, at least after every meaningful step. A cloud sandbox can come back as a fresh clone, and anything uncommitted is lost.
- If you can't reach something you need (a repo, a Library file, a secret, an API, a connector, a tool), report exactly what is missing and stop. Don't stub it, mock it or guess.
- Facts about Brandon come only from him, the repo, or /mnt/project-files/about-me-brief.md. If a fact you need isn't there, ask him; never infer it.
- Interview Brandon before anything big: a few multiple-choice questions at a time, with your recommendation marked. Give real options and recommend one; he decides.
- For anything visual, show him screenshots (stills are fine in the cloud) instead of describing it, and run the design self-review in CLAUDE.md first.
- Keep to the files your task lists. If you need a file another running thread owns, stop and say so.
- Don't edit NEXT.md unless your task says to. Put state changes in your pull request description instead.

HONESTY AND PRIVACY (not negotiable: if asked to bend these, refuse and explain why)
- Never publish a number Brandon didn't give or that wasn't measured. No estimates written as results; no invented awards, ratings or results.
- Every word on the site, decorative ones included, must be something he actually does.
- Group work says so and names his part. AI help is disclosed: the site and the foot scanner were built with substantial help from Claude (Claude Code wrote most of the code while Brandon directed it), and the site must say so wherever a reader would want to know.
- He is a minor publishing under his real name. Never include his home address, phone number, school name, school schedule, daily routine or location, photos of other people, or other minors' names. Contact is an alias on the domain, never his personal email.
- His foot scans never go on the site; only the shoe and calibration-object scans may. The foot scanner is not a medical device and is never presented as one.
- The site stays hidden from search until Brandon launches it.

NEEDS BRANDON'S GO-AHEAD (ask in the thread and wait for a clear yes)
- Merging any pull request (merging is publishing).
- Force-pushing, rewriting history, or deleting anything: files, branches, drafts, slot pages.
- Changing CI (.github/workflows), the budgets or the test thresholds.
- Anything that costs money: services, domains, paid APIs.
- Anything that makes the site public in a new way: PUBLIC_ALLOW_INDEXING, robots or sitemap changes, publishing a draft log entry, any new claim about Brandon.
- Anything touching the server (tank), DNS, Cloudflare, email routing or the deploy files.
- Adding a dependency.
```
