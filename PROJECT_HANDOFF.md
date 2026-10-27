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
