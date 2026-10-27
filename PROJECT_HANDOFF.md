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
| `PROJECT_HANDOFF.md` (this file) | ~42 KB | Every thread can read it at `/mnt/project-files/`. |
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

## D. Memory seed

Send this as one message in the project conversation. It's also included in the first
message (H), so you only need to send it separately if you skip H.

```text
Remember these for this project:
- main is the live site: tank pulls it every few seconds, so a merge is public before CI runs. Branch, PR, and merge only on Brandon's go-ahead.
- The site stays noindex (fail-closed) until launch; launch = PUBLIC_ALLOW_INDEXING=true on tank, only after Brandon approves the footer AI-disclosure wording and his parents review the site.
- Never publish a number Brandon didn't give; every decorative word must be something he does; AI help is disclosed.
- Privacy: he's a minor under his real name. No address, phone, school name, schedule, routine or location; contact only via a domain alias, never his personal email.
- Only the shoe and calibration-object scans may appear on the site, never his foot (decided 15 Oct 2026).
- The foot scanner is not a medical device and is never presented as one.
- Decided 15 Oct 2026: tennis since he was little (school team, tournaments, lessons, for fun); chess in rated over-the-board tournaments and online, no rating shown; the study started 11 Sept 2026 (confirmed); his CS teacher stays unnamed.
- Decided 16 Oct 2026: build-log drafts end "Built with Claude Code, which wrote most of the code while I directed it." The foot-scanner case study must say the same when rewritten.
- Contact is off until hello@ works through Cloudflare Email Routing: a bouncing address is worse than none.
- The four build-log drafts (draft: true) stay unpublished until Brandon has read them.
- The serve stays a hand-keyframed illustration labelled "Illustration · not footage" until public/serve/pose.json exists from his own footage (decided 7 Oct 2026).
- The About intro ("Ignition") is live three.js, not a video, so its five pieces are real links and it stays sharp and small. A professional About film is a separate project (about-film) that may replace it later.
- Phones: top-level pages are animation and short labels; paragraphs live one tap down (phone-collapse.ts); articles use a smaller type scale.
- Ambient drift runs only on the browsing pages (Home, Projects, Build log, About); articles stay still for reading. One Pause motion switch pauses the hero and the drift together.
- Pitfall: Chromium gives SwiftShader a WebGL context even with failIfMajorPerformanceCaveat, so gpu.ts also rejects software renderers by name. CI and cloud browsers get the stills.
- Pitfall: Safari reports scrollY a frame late. The tour's divergence check is 48 px after 200 ms; a 4 px check stopped it on its first frame there.
- Pitfall: iOS swallows a tap when it makes content appear (its hover heuristic), so the hero's touch start waits 700 ms before revealing the Pause button.
- Pitfall: a stop in an animation reads to Brandon as the page freezing. Hold moments with a slow drift, never a dead halt.
- Pitfall: the tour steps on real elapsed time capped at 250 ms; a 50 ms cap made slow frames play in slow motion. A hidden tab pauses it.
- Pitfall: additive point blending wrote alpha and left dark marks; the intro uses a glow blend (alpha = max(rgb)).
- Pitfall: the About intro's live/still decision must be an inline script that is the section's first child, or the stills flash and the layout shifts.
- Pitfall: the intro's setup yields between short steps and uses renderer.compileAsync. Without that, Lighthouse fell to 70 on blocking time.
- Pitfall: new three.js addons need adding to optimizeDeps in astro.config.mjs, or dev shows "504 Outdated Optimize Dep".
- Pitfall: reveals trigger when any part is in view ('some'); a percentage threshold on a tall element never fires on a short screen.
- Pitfall: drift points sit in front (z-index 25) and streaks behind (z-index -1); behind everything they vanished under the cards.
- Pitfall: intro audio starts before the picture so the ignition isn't missed; navigator.audioSession 'playback' lets it play past the iOS silent switch.
- Decision: the CSS budget is 60 KB render-blocking per page, not one site-wide total (which charged every page for the intro's styles).
- Dead end: jumping natively through the pinned serve looked frozen; replaced by the guided tour on a continuous path.
- Brandon's preferences: interview him first with multiple-choice questions and a marked recommendation; show screenshots, don't describe; plain words; push back on anything inflated.
- Brandon's preferences: professional, creative, futuristic, never templated; calm but crafted, and he loves the animations. Run the self-review questions (viewer experience, uniqueness, details, casual viewer) before showing work.
```

## E. Setup migration

Cloud threads load only the root `CLAUDE.md`, `.claude/CLAUDE.md` and `.claude/rules/`
from the repo. They ignore subfolder `CLAUDE.md` files, the repo's skills, agents,
commands, `.mcp.json` and `.claude/settings.json`, and they get nothing from this Mac's
Claude Code setup.

| Local piece | Where it is today | New home |
|---|---|---|
| Repo rules | No `CLAUDE.md` anywhere on `main`; the rules lived in `NEXT.md`, `CONTRIBUTING.md` and this session's memory | **Root `CLAUDE.md`**, added on this branch |
| Subfolder `CLAUDE.md` | Only `apps/forge-ios/CLAUDE.md`, on the unpushed local branch `forge-ios`. That's another session's Forge work, not this project | Not part of this project |
| Path-specific rules (`.claude/rules/`) | None | Nothing to move |
| `.claude/launch.json` (repo), `~/code/.claude/launch.json`, `apps/footscan/.claude/launch.json` | Desktop-app preview configs (site dev server; footscan studio) | **Local threads only** |
| Skills, agents, commands | None in the repo; none at user level that this work used | Nothing to move |
| MCP servers | No `.mcp.json`; no user-level MCP servers | Nothing to move |
| Desktop browser pane, iOS Simulator tools, Claude in Chrome | Built into the desktop app | **Local threads only** |
| claude.ai connectors | None used by this work | None needed |
| Plugins | User-level only: codex, claude-obsidian, cache-keeper, recording-mode, goal-meter, collision-guard, next-steps-desktop (desktop UI mods and helpers) | **Local threads only**; nothing needed in Project settings > Plugins |
| Hooks | Only those the plugins above bring; none in the repo | **Local threads only** |
| Permission rules | None (`settings.local.json` holds only skill overrides) | Nothing to move; threads run in auto mode |
| This session's local memory (`brandongreene-site.md`, `design-self-review-questions.md`) | `~/.claude/projects/-Users-bgreene-code/memory/` | **Memory seed (D)** and root `CLAUDE.md` |
| `~/.claude/CLAUDE.md` (notes about the desktop mods) | User level | **Local threads only**; not relevant to the site |
| Prompt and brief files | `~/code/*.md`, not in git | **Library** (see B) |
| `PUBLIC_ALLOW_INDEXING` | Build flag; tank sets it at launch; CI sets it only for its Lighthouse build | **Tank only.** Never set it in the cloud environment |
| `PLAYWRIGHT_BROWSERS_PATH` | New | **Cloud environment variable**, `/opt/ms-playwright` (not a secret). It keeps Chromium where both the setup script and the threads look |
| `LHCI_GITHUB_APP_TOKEN` | GitHub Actions secret | **Stays in GitHub Actions**; threads don't need it |
| `deploy/deploy.env`: `SSH_USER`, `SSH_HOST`, `SSH_PORT`, `REMOTE_DIR`, `SITE_DOMAIN` | Gitignored, on the Mac | **Local only**; never in the cloud |
| Cloudflare Tunnel credentials | On tank | **Tank only** |
| Network secrets | None needed | Nothing to add |
| Node 22, npm, git, gh | Mac (Node 24 locally) | Already in the cloud image (Node 22 on PATH, as in CI) |
| Playwright 1.63.0 Chromium (axe, the tour check, stills) | Installed by npm on the Mac | **Setup script** below |
| Real-GPU Playwright (`--use-angle=metal`), `npm run render:about`, live 3D checks | Mac GPU | **Local threads only** |
| iOS Simulator mobile Safari checks | Xcode on the Mac | **Local threads only** |
| Deploys | tank pulls `main` by itself | Nothing to do; merging to `main` deploys |
| Extra domains | Playwright downloads its browsers from hosts the Trusted list doesn't include | **Cloud environment**: Network access **Custom**, tick **Also include default list of common package managers**, and add `cdn.playwright.dev`, `playwright.download.prss.microsoft.com` and `playwright.azureedge.net`. Which one Playwright 1.63 uses is **UNVERIFIED**; the first setup run's log shows it, and you can drop the unused ones afterwards |
| External link checks | `npm run test:links` fetches every external link | **CI only.** Threads run `check-links.mjs --skip-external`, so no extra domains are needed |

### Draft setup script

For **Project settings > Environment** (a new Anthropic-hosted environment), with the
environment variable `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` and the Custom network
list above.

```bash
#!/usr/bin/env bash
# brandongreene-site: cloud environment setup. It runs as root on Ubuntu 24.04 before
# Claude starts, and is cached when it finishes in about five minutes. Tools only: each
# thread runs `npm ci` in its own clone.
set -euo pipefail

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/ms-playwright}"

# Node 22 is already on PATH, the same major version CI uses.
node --version

# Chromium and its system libraries for Playwright, at the version package-lock.json
# pins. Bump this line when the lockfile's playwright version changes.
npx -y playwright@1.63.0 install --with-deps chromium
chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"
```

**UNVERIFIED** (nothing here has run in a cloud environment yet):

- that the script finishes inside the cache window;
- that threads run as a user who can read `/opt/ms-playwright` (the `chmod` covers a non-root user);
- that `npm ci` and `npm run test:a11y` work in a thread afterwards.

The pilot (F1) proves all three.

## F. Backlog (thread-sized)

Tasks with no dependency between them touch different files, so any two can run at once.
Run at most two at a time, and run the pilot alone first. Several tasks wait on
something only Brandon can do; those are marked **Waits on Brandon**.

| ID | Task | Outcome | Files it touches | Done when | Where (why) | Depends on |
|---|---|---|---|---|---|---|
| **F1** | **PILOT: bring NEXT.md up to date** | `NEXT.md` matches the code and `git log` as of now:<br>• the header no longer says 7 Oct;<br>• open questions settled on 15–16 Oct (contact, start date, teacher, tennis and chess) move to a "Decided" list instead of being asked again;<br>• the About-intro voiceover paragraph agrees with `src/scripts/intro/index.ts` and `sound.ts` (it still says sound never plays unless someone presses "Play with sound", but the effects now autoplay quietly when the browser allows; check the timings against `PACE` and `TIMING`);<br>• the "Verified, last run" table says when it was last run.<br>Doc only: nothing is added that isn't in a commit or a file. | `NEXT.md` only | Every changed line traceable to a commit or a file, cited in the PR description; `npm run check` and `npm run build` pass; CI green. This also proves the cloud environment (setup script, Playwright, `npm ci`). | Cloud (docs and git history only) | None |
| F2 | Refresh the foot-scanner case study | `content/projects/foot-scanner.md` reflects footscan `main` today: the phase table (Phases 2–3 and the first-fit insole are built), the case-study section order from CONTRIBUTING.md, the "what failed" section, and the AI disclosure from D. Uses only shoe and calibration-object images, never the foot. Every figure is copied from footscan's docs with its source named. Follows `/mnt/project-files/footscan-portfolio-prompt.md`. | `content/projects/foot-scanner.md` and new images beside it | Each claim cited to a footscan file or commit in the PR; no foot-scan images; `npm test` checks pass; CI green; Brandon approves the wording before merge. | Cloud (adds `BrandonG0123/footscan` read-only) | None. Interview Brandon on the open questions in the file first |
| F3 | Publish the four build-log drafts | The four `draft: true` entries go public: the draft flag and the review comment are removed, the text is unchanged except for corrections Brandon asks for. | `content/log/2026-10-01-phase-2-reconstruction.md`, `2026-10-05-phase-3-landmarks.md`, `2026-10-12-iphone-app-first-scans.md`, `2026-10-14-first-fit-insole.md` | They appear on `/log` and their project page in the build; the AI line is still on each; CI green. | Cloud | **Waits on Brandon** reading them and saying which are ready |
| F4 | Refresh the About-me brief | A corrected `about-me-brief.md`: the tennis, chess, start-date and AI-help facts from D; skills as on `/resume`; everything else unchanged. | No repo files; delivers the new brief to the Library | Every line traceable to the site, NEXT.md or D; Brandon confirms; the old Library copy is replaced only with his OK. | Cloud | None |
| F5 | Report on the stale branch `claude/confident-curie-7t6jj7` | A short report: what its commit (`3098a35`, 8 Oct, "NEXT.md: Lighthouse results, and the two pages that fail it on main too") changes, whether it still applies now that Lighthouse passes on main, and a recommendation. **Nothing is deleted or merged.** | None (read-only) | Report posted in the thread with the diff summarised. | Cloud | None |
| F6 | Contact section | A Contact section on `/about` and a "Get in touch" link in the footer, pointing at the domain alias. | `src/pages/about.astro`, `src/components/Footer.astro` | The address receives a test message (Brandon checks); axe and links pass; CI green. | Cloud | **Waits on Brandon** setting up Cloudflare Email Routing for the alias (dashboard, his account) |
| F7 | Résumé: coursework and competitions | The `TODO Brandon` comment in `src/pages/resume.astro` is replaced with the facts he gives, or removed with his OK. | `src/pages/resume.astro` | Only facts from Brandon; checks pass; CI green. | Cloud | **Waits on Brandon**'s answers (interview him) |
| F8 | Wire up the About-intro voiceover | His recording and captions are added; the transcript appears; the picture follows the audio. | `public/about/voiceover.m4a` (or `.mp3`), `public/about/voiceover.vtt` | Captions and transcript render; checks pass; then a local Safari check in the iOS Simulator. | Cloud, plus a local Safari check | **Waits on Brandon** recording it (no school, location or schedule details; parents review) |
| F9 | Real serve from his footage | `public/serve/pose.json` from his own serve footage, so the serve switches from the illustration to real mode. The footage itself is never committed. | `public/serve/pose.json`, plus a new pose-extraction script under `scripts/` | The serve shows real mode with no invented numbers; checks pass; the live view is checked locally on the GPU. | Cloud for the pose extraction (the video goes in through the Library tab if it's over 30 MB); local GPU check | **Waits on Brandon** filming it: tripod, side-on, slow motion, nobody else in frame, no recognisable court |
| F10 | Put the About film on the About page | The about-film project's `handoff/` package is integrated, replacing or sitting beside the live intro, as Brandon chooses. | `src/components/AboutIntro.astro`, `src/scripts/intro/`, `public/about/` | Brandon approves it on his Mac; Lighthouse and budgets pass; CI green. | Local first (live GPU, Safari), cloud for the code | The about-film project finishing; that repo pushed to GitHub |
| F11 | Manual accessibility pass | `docs/manual-a11y-test.md` worked through, findings fixed in follow-up tasks. | Report only; fixes become new tasks | Each checklist item answered with what was seen. | **Local** (VoiceOver and real devices) | None |
| F12 | Launch | `PUBLIC_ALLOW_INDEXING=true` on tank; the site becomes indexable. | tank's scheduled build (no repo change) | robots.txt allows crawling and pages drop `noindex`. | **Local (tank)** | **Brandon's go-ahead**, after: the footer AI wording is approved, no fill-in markers or TODOs are left (F7), and his parents have reviewed the site |

**Running two at a time:** after F1, good pairs are F2 + F4, F2 + F5 and F4 + F5. F6, F7
and F3 touch separate files too, so they pair with anything once Brandon has done his
part.

F2 and F10 shouldn't edit `NEXT.md`; whoever finishes later asks for a NEXT.md update
as a separate small task.

## G. Your transfer steps

This session is a **local session** in the desktop app's Code tab on your Mac (Claude
Code 2.1.293, newer than the 2.1.280 that Projects need for local threads).

### 1. Merge this branch into main first

Threads start from the repo's default branch, and right now `main` has no `CLAUDE.md`,
so they'd begin without the site's rules. Merge `project-handoff/site` into `main`.

- On GitHub, open a pull request from `project-handoff/site` to `main`, let CI pass, and merge it. Or tell Claude "merge the handoff branch" and it will.
- It only adds `CLAUDE.md` and `PROJECT_HANDOFF.md` at the repo root. The build ignores both, so **brandongreene.dev doesn't change**, though tank will rebuild once.
- The instructions in C then say base branch `main`, which is what threads use anyway.
- If you'd rather not merge yet, change the instructions' "Base branch: main" to `project-handoff/site`. But tank deploys only `main`, so that's only worth it for a short time.

### 2. Move this session into a new project

1. Check that **Require trusted devices** is off. It's off by default; on Pro and Max it's on the Account (or Cowork) page of your claude.ai settings. While it's on, a project can't read this session or run local threads.
2. In this session's prompt box, type `/remote-control` (or `/rc`) and select **Enable Remote Control** if asked. Or ask Claude here to turn it on for you.
3. In a browser, open [claude.ai/code](https://claude.ai/code), find this session's row in the sidebar, open its menu, and choose **Move to project > Continue as new project**.
4. The project opens and Claude posts **Setup recommendations**:
   - keep `BrandonG0123/brandongreene-site` on;
   - switch off anything for footscan, Forge or about-film (separate projects);
   - click **Update setup**.
5. This local session stays in your list. Stop it once the project is running, so the two don't work at once.

**Fallback** (if Move to project fails, or trusted devices must stay on):

1. **Projects > New project**.
2. Add the repository `BrandonG0123/brandongreene-site`.
3. In **Context**, add the files from B.
4. Carry on with step 3 below and send the message in H.

### 3. Set the project up

1. **GitHub access.** Make sure the Claude GitHub App can see the repo: [github.com/settings/installations](https://github.com/settings/installations) > Claude > Repository access includes `brandongreene-site`. Whether it's installed is **UNVERIFIED** from here.
2. **Library.** On Overview > Library, click **Add** and upload:
   - `PROJECT_HANDOFF.md` (from the repo root);
   - `~/code/about-me-brief.md`;
   - `~/code/footscan-portfolio-prompt.md`;
   - optionally the two About animation and film prompts.

   All are small, so every thread can read them under `/mnt/project-files/`.
3. **Instructions.** Paste the block from C into **Project settings > Memory > Project instructions** (4,932 characters, under the 16,000 limit).
4. **Environment.** Under **Project settings > Environment**, add an environment:
   - Network access **Custom**, with **Also include default list of common package managers** ticked, plus the three Playwright hosts;
   - the environment variable `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`;
   - the setup script from E;
   - no network secrets.
5. **Models** (Project settings > General):
   - **Coordinator:** Opus 5.5, **low** effort (the default). It routes and tracks; it doesn't write code.
   - **Threads:** Opus 5.5 at **medium** as the default instead of high, because most of this backlog is careful content and docs work. Ask for **high** in the task for design, 3D or motion work (F9, F10), and ask for **Sonnet 5.5** for doc-only tasks (F1, F4, F5) to save your plan limits.
6. Send the message in **H** as the project's first message.

### Local threads

These tasks need your Mac: F11, F12, and the GPU and Safari checks in F8–F10.

- They run through Remote Control. In the desktop app, turning on **Keep this computer awake for Remote Control** (Settings > Code) keeps them going.
- **Local threads don't get project memory**, only the instructions. When you start one, paste the D lines that matter for it into the task.


## H. First message for the project conversation

Send this as the first message. It stands on its own: it doesn't rely on Claude opening
any file.

```text
This project finishes and launches brandongreene.dev: my portfolio and the dated build log of my AI/ML independent study, with every claim on it true and checked, going public only when my parents and I approve. The repo is BrandonG0123/brandongreene-site; base branch main, which is the live site (the server pulls it every few seconds), so threads work on site/<topic> branches and open pull requests, and nothing merges without my go-ahead. The full handoff is in PROJECT_HANDOFF.md at the repo root and in the Library (/mnt/project-files/PROJECT_HANDOFF.md); the repo's CLAUDE.md, NEXT.md and CONTRIBUTING.md hold the rules. footscan (BrandonG0123/footscan) and about-film are separate projects.

Remember these for this project:
- main is the live site: tank pulls it every few seconds, so a merge is public before CI runs. Branch, PR, and merge only on Brandon's go-ahead.
- The site stays noindex (fail-closed) until launch; launch = PUBLIC_ALLOW_INDEXING=true on tank, only after Brandon approves the footer AI-disclosure wording and his parents review the site.
- Never publish a number Brandon didn't give; every decorative word must be something he does; AI help is disclosed.
- Privacy: he's a minor under his real name. No address, phone, school name, schedule, routine or location; contact only via a domain alias, never his personal email.
- Only the shoe and calibration-object scans may appear on the site, never his foot (decided 15 Oct 2026).
- The foot scanner is not a medical device and is never presented as one.
- Decided 15 Oct 2026: tennis since he was little (school team, tournaments, lessons, for fun); chess in rated over-the-board tournaments and online, no rating shown; the study started 11 Sept 2026 (confirmed); his CS teacher stays unnamed.
- Decided 16 Oct 2026: build-log drafts end "Built with Claude Code, which wrote most of the code while I directed it." The foot-scanner case study must say the same when rewritten.
- Contact is off until hello@ works through Cloudflare Email Routing: a bouncing address is worse than none.
- The four build-log drafts (draft: true) stay unpublished until Brandon has read them.
- The serve stays a hand-keyframed illustration labelled "Illustration · not footage" until public/serve/pose.json exists from his own footage (decided 7 Oct 2026).
- The About intro ("Ignition") is live three.js, not a video, so its five pieces are real links and it stays sharp and small. A professional About film is a separate project (about-film) that may replace it later.
- Phones: top-level pages are animation and short labels; paragraphs live one tap down (phone-collapse.ts); articles use a smaller type scale.
- Ambient drift runs only on the browsing pages (Home, Projects, Build log, About); articles stay still for reading. One Pause motion switch pauses the hero and the drift together.
- Pitfall: Chromium gives SwiftShader a WebGL context even with failIfMajorPerformanceCaveat, so gpu.ts also rejects software renderers by name. CI and cloud browsers get the stills.
- Pitfall: Safari reports scrollY a frame late. The tour's divergence check is 48 px after 200 ms; a 4 px check stopped it on its first frame there.
- Pitfall: iOS swallows a tap when it makes content appear (its hover heuristic), so the hero's touch start waits 700 ms before revealing the Pause button.
- Pitfall: a stop in an animation reads to Brandon as the page freezing. Hold moments with a slow drift, never a dead halt.
- Pitfall: the tour steps on real elapsed time capped at 250 ms; a 50 ms cap made slow frames play in slow motion. A hidden tab pauses it.
- Pitfall: additive point blending wrote alpha and left dark marks; the intro uses a glow blend (alpha = max(rgb)).
- Pitfall: the About intro's live/still decision must be an inline script that is the section's first child, or the stills flash and the layout shifts.
- Pitfall: the intro's setup yields between short steps and uses renderer.compileAsync. Without that, Lighthouse fell to 70 on blocking time.
- Pitfall: new three.js addons need adding to optimizeDeps in astro.config.mjs, or dev shows "504 Outdated Optimize Dep".
- Pitfall: reveals trigger when any part is in view ('some'); a percentage threshold on a tall element never fires on a short screen.
- Pitfall: drift points sit in front (z-index 25) and streaks behind (z-index -1); behind everything they vanished under the cards.
- Pitfall: intro audio starts before the picture so the ignition isn't missed; navigator.audioSession 'playback' lets it play past the iOS silent switch.
- Decision: the CSS budget is 60 KB render-blocking per page, not one site-wide total (which charged every page for the intro's styles).
- Dead end: jumping natively through the pinned serve looked frozen; replaced by the guided tour on a continuous path.
- Brandon's preferences: interview him first with multiple-choice questions and a marked recommendation; show screenshots, don't describe; plain words; push back on anything inflated.
- Brandon's preferences: professional, creative, futuristic, never templated; calm but crafted, and he loves the animations. Run the self-review questions (viewer experience, uniqueness, details, casual viewer) before showing work.

Backlog (details, files and done-checks are in section F of the handoff):
F1 PILOT: bring NEXT.md up to date (docs only; also proves the cloud environment)
F2 Refresh the foot-scanner case study from the footscan repo
F3 Publish the four build-log drafts (waits on me reading them)
F4 Refresh the About-me brief in the Library
F5 Report on the stale branch claude/confident-curie-7t6jj7 (read-only, delete nothing)
F6 Contact section (waits on me setting up email routing)
F7 Résumé coursework and competitions (waits on my answers)
F8 Wire up the About-intro voiceover (waits on my recording)
F9 Real serve from my footage (waits on my filming)
F10 Put the About film on the About page (waits on the about-film project)
F11 Manual accessibility pass (local, on my Mac)
F12 Launch: PUBLIC_ALLOW_INDEXING on tank (local, my go-ahead only)

How to run this:
- Propose threads before starting any, and wait for my go-ahead.
- Run at most two threads at a time.
- Start with the pilot, F1, on its own, using Sonnet 5.5. When it comes back, tell me what worked and what didn't in the setup (setup script, Playwright, npm ci, the checks), and fix the instructions or environment before anything else runs.
- Tasks that wait on me: ask me what you need, with multiple-choice questions and your recommendation marked, rather than starting them.
- If a thread can't reach something it needs, it reports exactly what's missing and stops.
```

## I. Where the work stands

Reconstructed on 27 Oct 2026 from `git log`, the code, `NEXT.md` and the files on disk.

### Done (on main, live on brandongreene.dev, hidden from search)

- **Pages**: home, `/projects`, `/projects/<slug>`, `/about`, `/log`, `/resume`, the 404 ("Out." line call). Also RSS, sitemap, a generated robots.txt and per-project social cards.
- **The futuristic redesign** (7 Oct, merged from `redesign/futuristic`):
  - the gyroid hero (still first, live shader on first interaction);
  - the scroll-scrubbed serve (an illustration, labelled);
  - the 3D model viewer on cards and case studies;
  - the kinetic band with a tape measure;
  - the build-log timeline, the chapter rail, and the optic-yellow ball favicon.
- **"See the work"** guided scroll (`src/scripts/tour.ts`), 7 and 14 Oct. It walks through the serve at reading pace on a continuous path, any input stops it and a key skips it. It was fixed for iPhone and Safari on 14 Oct (`22d7056`).
- **About intro "Ignition"** (7 Oct):
  - the sequence: a burning ball, embers, chess knight, calibration object, network, gyroid, then five link pieces;
  - 25% faster;
  - synthesised sound that plays quietly by itself when the browser allows, with Mute remembered, Replay playing sound, and the iOS silent switch handled;
  - the voiceover slot is built and stays invisible until the files exist.
- **Phones** (7 Oct): pictures and short labels; paragraphs fold one tap down on About and the Build log; a smaller type scale in articles.
- **Ambient drift** on the browsing pages (14 Oct), under the header's Pause motion switch.
- **Content** (15–16 Oct):
  - tennis and chess on `/about` and `/resume`;
  - résumé skills;
  - four build-log drafts with the AI line;
  - Contact removed until a working alias exists.
- **CI**: green on `main` for every commit through `248eb5a` (16 Oct), checked through GitHub's public API.

### Checked again today on this branch

These ran locally on the Mac (Node 24), not yet in a cloud environment:

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | 7 pages built |
| `npm run test:a11y` | 0 violations |
| `check-links.mjs --skip-external` | 42 internal links, all resolve |
| `npm run test:budget` | within budget (heaviest page CSS well under 60 KB) |
| `npm run test:tour` | 9 of 9 pass (desktop, phone, wheel stop, key skip, reduced motion) |

### Half done

- **The footer's AI-disclosure line** is live but not approved. It reads: "Designed and coded with substantial help from Claude, an AI model. The projects are mine, and every claim on this site is checked against them." Brandon approves or rewords it.
- **The foot-scanner case study** is out of date: its phase table predates Phases 2–3, the iPhone app and the first-fit insole, and it doesn't carry the AI disclosure yet (F2).
- **The four build-log drafts** are written and waiting for Brandon to read them (F3).
- **The résumé** still has a `TODO Brandon` comment for coursework and maths competitions (F7).
- **The serve** is still the illustration; real mode waits on footage (F9).
- **NEXT.md** is partly stale (F1).
- **The About film**: brief written (`~/code/about-film`); its Remotion work is local only (see below).

### Left for Brandon (no thread can do these)

- Read the drafts.
- Approve the footer wording.
- Answer the résumé questions.
- Set up Cloudflare Email Routing for the contact alias.
- Film the serve.
- Record the voiceover (optional).
- Have his parents review the site, then decide on launch (F12).
- Also known and accepted: tank goes down roughly weekly (per NEXT.md). Until that's fixed, the URL shouldn't go anywhere that gets one shot.

### Decisions, dead ends and pitfalls

All in D. The ones that cost the most:

- main deploys at once;
- SwiftShader passes the GPU flag;
- Safari's late scrollY;
- halts read as freezes.

### Not in this project, and left untouched

- **`forge-ios` branch in `~/code/brandongreene-site`**:
  - 10 unpushed commits (`a940b71`..`64fb086`, "Forge iPhone app and the workout log web app" onwards);
  - uncommitted edits to `apps/forge-ios/CLAUDE.md` and `ROADMAP.md`, and an untracked `apps/forge-ios/PROJECT-BRIEF.md`.

  That's another session's Forge work. It's **not pushed anywhere**, so it exists only on this Mac. The Forge session that owns it should push it, or Brandon can decide. That checkout's working tree wasn't changed: this branch was made in a separate worktree at `~/code/brandongreene-site-handoff`, which can be removed with `git worktree remove` once this branch is merged.
- **footscan** (`~/code/footscan`) has its own Project handoff on `project-handoff/footscan`:
  - Its uncommitted `project.pbxproj` change is the kind its rules keep out of git (the Apple team ID).
  - The shoe converted for Bambu Studio on 14 Oct (`reports/shoe-print/`: full size and a 71% version that fits the X1C, as 3MF and STL, 1.6 MB together) is gitignored by that repo's rules, so it stays on the Mac.
- **about-film** (`~/code/about-film`):
  - no GitHub remote;
  - one commit (`cff681e`, the brief), plus a lot of untracked Remotion work from the film session and a Claude worktree.

  It isn't pushed, because there's nowhere on github.com to push it. Create `BrandonG0123/about-film` if you want it in a project.
- **The `~/code` prompt files** go to the Library, not into git.
- **Stale remote branch `claude/confident-curie-7t6jj7`**: left alone (F5 reports on it).

### UNVERIFIED

1. The Claude GitHub App is installed on `BrandonG0123/brandongreene-site`. There was no GitHub CLI or sign-in to check with.
2. **Require trusted devices** is off on Brandon's account (it's off by default).
3. Which host Playwright 1.63 downloads Chromium from, whether the setup script finishes inside the cache window, and whether thread users can read `/opt/ms-playwright`. The pilot shows all three.
4. The checks above passing on Linux and Node 22 in a cloud thread. They passed on macOS with Node 24, and CI (Linux, Node 22) passed on `main`.
5. Whether anything on `claude/confident-curie-7t6jj7` is still wanted.
6. Why Brandon heard no sound from the intro in the desktop app's browser pane (7 Oct). The headless test browser allowed autoplay, so a blocked start couldn't be reproduced; the pane may mute audio.
