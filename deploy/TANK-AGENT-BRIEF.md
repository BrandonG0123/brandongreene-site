# Brief for the agent on `tank` (Windows 11)

Self-contained instructions for serving Brandon's site on his domain from the
`tank` machine. You should not need the conversation this came from.

**Target machine:** Windows 11. It also runs a Minecraft server. It goes down
roughly once a week, so everything below must survive a reboot without a human.

---

## The facts you need

| | |
|---|---|
| Domain | `brandongreene.dev` |
| Repo | `https://github.com/BrandonG0123/brandongreene-site.git` |
| DNS | Already on Cloudflare nameservers (`adam`/`elly.ns.cloudflare.com`) |
| Existing records | MX only, for Namecheap email forwarding — **do not touch these** |
| A / CNAME | None yet. The tunnel creates it. |

`SITE` in `astro.config.mjs` is already set to `https://brandongreene.dev`.
Canonical URLs, sitemap, RSS, robots.txt, the résumé header and the generated
social cards all derive from it. Nothing else needs the domain typed into it.

---

## What you are building

```
tank (Windows 11)                              internet
┌────────────────────────────────┐            ┌──────────┐
│ git clone + npm run build      │            │          │
│   └─ C:\srv\...\dist           │   tunnel   │ visitors │
│ Caddy serves it on :8080       │ ─────────▶ │          │
│ cloudflared dials out          │            └──────────┘
└────────────────────────────────┘
```

A static site: plain HTML, CSS, fonts, images. No database, no server-side
runtime. Seven pages, 5.9 KB of JavaScript total.

**Why a Cloudflare Tunnel and not port forwarding.** Brandon is a minor and the
site carries his real name. A DNS A record pointing here would publish his home
IP, which geolocates to his neighbourhood. The tunnel dials *outbound* instead:

- his home IP never enters public DNS
- **no router ports opened and no Windows Firewall inbound rules needed** —
  cloudflared talks to `localhost`, so nothing listens to the outside world
- the Minecraft server's existing port forwarding is untouched
- a changing residential IP breaks nothing
- Cloudflare terminates HTTPS, so Caddy serves plain HTTP on localhost

**Do not replace this with port forwarding.** It is a privacy decision, not an
implementation detail. Caddy is deliberately bound to `localhost:8080` — not
`:80`, not `:443` — to keep that true and to stay out of the way of anything
else on this machine.

---

## Step 0 — Report back before changing anything

```powershell
winver
node --version
git --version
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
Get-Service | Where-Object {$_.Name -like "*cloudflared*" -or $_.Name -like "*caddy*"}
```

Tell Brandon what's installed and whether 8080 is free. If something already
holds 8080, pick another free port and change it in **both** the Caddyfile and
the cloudflared config.

---

## Step 1 — Install the tooling

Using winget (built into Windows 11), in an **Administrator** PowerShell:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Cloudflare.cloudflared -e
```

Close and reopen PowerShell afterwards so PATH updates.

Caddy: if `winget install --id CaddyServer.Caddy -e` works, use it. Otherwise
download `caddy_windows_amd64.zip` from
<https://github.com/caddyserver/caddy/releases/latest>, extract `caddy.exe` to
`C:\caddy\`, and add that folder to PATH.

Verify all four:

```powershell
git --version; node --version; caddy version; cloudflared --version
```

---

## Step 2 — Get the site and build it

```powershell
mkdir C:\srv -Force
cd C:\srv
git clone https://github.com/BrandonG0123/brandongreene-site.git
cd brandongreene-site
npm ci
npm run build
```

Output lands in `C:\srv\brandongreene-site\dist`. Confirm `dist\index.html`
exists before continuing.

**To update later:** `git pull; npm ci; npm run build` — Caddy serves the folder
directly, so no restart is needed.

### A check you must not skip

The build must contain **only** the real project. Placeholder entries exist in
the repo for layout work and are stripped from production builds by design:

```powershell
Get-ChildItem C:\srv\brandongreene-site\dist\projects
```

Expect `foot-scanner` and `index.html` and nothing else. If any `slot-*` folder
appears, **stop and tell Brandon** — something is wrong and the site must not go
live with fabricated project entries on it.

---

## Step 3 — Caddy

Copy `deploy\Caddyfile.windows` from the repo to `C:\caddy\Caddyfile`. It is
already written for Windows paths and for serving on localhost only.

```powershell
caddy validate --config C:\caddy\Caddyfile
caddy run --config C:\caddy\Caddyfile
```

In a second window:

```powershell
curl.exe -sI http://localhost:8080/ | Select-Object -First 1          # 200
curl.exe -sI http://localhost:8080/projects | Select-Object -First 1  # 200
```

Then stop it (Ctrl+C) and make it a service — **this machine reboots weekly, so
a foreground process is not acceptable.**

Caddy has no built-in Windows service installer. Two documented options; pick
one and verify it actually survives a reboot:

1. **NSSM** (simplest):
   ```powershell
   winget install --id NSSM.NSSM -e
   nssm install Caddy "C:\caddy\caddy.exe" "run --config C:\caddy\Caddyfile"
   nssm start Caddy
   ```
2. **Task Scheduler** — new task, trigger "At startup", action
   `C:\caddy\caddy.exe run --config C:\caddy\Caddyfile`, run whether user is
   logged on or not, highest privileges.

---

## Step 4 — Cloudflare Tunnel

Brandon must authorise in a browser when prompted. The domain is already on
Cloudflare nameservers, so there is nothing to change at the registrar.

```powershell
cloudflared tunnel login
cloudflared tunnel create brandongreene
cloudflared tunnel route dns brandongreene brandongreene.dev
cloudflared tunnel route dns brandongreene www.brandongreene.dev
```

Note the tunnel ID and credentials file path printed by `create` — on Windows
the credentials land in `C:\Users\<user>\.cloudflared\<TUNNEL-ID>.json`.

Create `C:\Users\<user>\.cloudflared\config.yml`:

```yaml
tunnel: brandongreene
credentials-file: C:\Users\<user>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: brandongreene.dev
    service: http://localhost:8080
  - hostname: www.brandongreene.dev
    service: http://localhost:8080
  - service: http_status:404
```

Install as a Windows service so it returns after a reboot:

```powershell
cloudflared service install
Start-Service cloudflared
Get-Service cloudflared
```

**`route dns` only adds A/CNAME records. It must not disturb the existing MX
records** — Brandon's email forwarding depends on them. Verify after:

```powershell
nslookup -type=MX brandongreene.dev
```

Four `eforward*.registrar-servers.com` entries should still be there.

---

## Step 5 — Indexing. Read this before telling Brandon you're done.

`/about` and `/resume` still display literal `[To fill in: ...]` placeholder
text. This site is for college admissions readers roughly two years out. A
half-finished page indexed under his real name is a long-lived cost that is hard
to undo.

The suppression switch is applied **at build time**:

```powershell
$env:PUBLIC_ALLOW_INDEXING="false"; npm run build
```

Every page then sends `noindex, nofollow` and `/robots.txt` serves `Disallow: /`.

**Build with the flag set.** Only drop it when Brandon explicitly confirms the
pre-launch checklist in `DEPLOY.md` is complete — including that his parents have
seen the site. Do not make that call yourself.

Confirm which mode is live:

```powershell
curl.exe -s https://brandongreene.dev/robots.txt
```

---

## Step 6 — Verify

```powershell
curl.exe -sI https://brandongreene.dev | Select-Object -First 1                    # 200
curl.exe -sI https://brandongreene.dev/projects | Select-Object -First 1           # 200
curl.exe -sI https://brandongreene.dev/projects/foot-scanner | Select-Object -First 1
curl.exe -sI https://brandongreene.dev/nope | Select-Object -First 1               # 404
curl.exe -sI https://brandongreene.dev/og/foot-scanner.png | Select-Object -First 1
curl.exe -s  https://brandongreene.dev/robots.txt
```

Then **reboot tank and re-run those**. If the site does not come back by itself,
the services are not configured correctly and the weekly downtime becomes
permanent downtime.

Finally, ask Brandon to open it on his phone. That check cannot be done here.

---

## Troubleshooting

**Nothing loads.** Isolate the two halves:

```powershell
curl.exe -sI http://localhost:8080/ | Select-Object -First 1
Get-Service cloudflared
```

Localhost works but the domain doesn't → tunnel or DNS. Localhost fails too →
Caddy or the files.

**404 on `/projects` but `/projects/` works.** The `try_files` line is wrong.
Compare against `deploy\Caddyfile.windows`.

**Caddy won't start.** Backslashes in the Caddyfile are escape characters — paths
must use forward slashes (`C:/srv/...`).

**Certificate errors.** `.dev` is on the HSTS preload list, so browsers refuse
plain HTTP for it entirely. Cloudflare terminates TLS at the edge; check the
domain's SSL/TLS mode in the Cloudflare dashboard is **Full**, not Flexible.

**Stale content after a rebuild.** HTML is set to revalidate, so it's usually
browser cache. Cloudflare also caches — purge under Caching → Purge Everything.

---

## Constraints that are not yours to change

- **No port forwarding.** The tunnel exists for a privacy reason.
- **Do not enable indexing** without Brandon's explicit go-ahead.
- **Do not touch the MX records.** Email forwarding depends on them.
- **Do not edit site content.** The site has strict rules about never stating
  unverified claims, and every line was written against evidence. If something
  reads wrong, report it rather than fixing it.
- **Do not commit anything from this machine** — in particular its address or
  any tunnel credentials.
