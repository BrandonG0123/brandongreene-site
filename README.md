# brandongreene-site

The source for **brandongreene.dev**, plus the apps it hosts.

```
.                    the website (Astro, static): builds to dist/, served by Caddy
apps/footscan/       footscan, the foot-scan app (Python): footscan.brandongreene.dev
deploy/              server configs and the brief for tank (Windows 11)
```

## The website

```bash
npm install
npm run dev          # http://localhost:4321
npm test             # build + accessibility + links + budget
```

Deploying: [DEPLOY.md](DEPLOY.md) and, for tank, [deploy/TANK-AGENT-BRIEF.md](deploy/TANK-AGENT-BRIEF.md).
Contributing and adding a project: [CONTRIBUTING.md](CONTRIBUTING.md).

## footscan (`apps/footscan`)

A phone-scan-to-printed-insole research pipeline. **Not a medical device**:
see [apps/footscan/docs/SAFETY.md](apps/footscan/docs/SAFETY.md).

It is a running Python program (photo uploads, an operator studio, 3-D
reconstruction), not static files, so it is served separately from the
website: its own subdomain, `footscan.brandongreene.dev`, on the same
Cloudflare Tunnel. Running it on tank:
[apps/footscan/docs/DEPLOY-TANK.md](apps/footscan/docs/DEPLOY-TANK.md).

`apps/footscan` is a **git subtree** of the footscan project (developed in
its own repo on the Mac, history included here). To bring in new work from
that repo:

```bash
git subtree pull --prefix=apps/footscan ../footscan main
```

Never commit anything from `apps/footscan/data/`, `.studio_key`, `.certs/` or
`.venv/`; footscan's own `.gitignore` already excludes them.
