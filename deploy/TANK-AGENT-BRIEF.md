# Brief for the agent on `tank`

Self-contained instructions for getting Brandon's site serving on his domain
from the `tank` machine. You should not need the conversation this came from.

---

## Two things Brandon must supply before you can finish

**Do not guess either of these. Stop and ask him.**

1. **The domain.** He registered one but has not said which. It goes in exactly
   two places: `SITE` in `astro.config.mjs` (on his Mac, before building) and the
   first line of the Caddyfile (here).
2. **Whether the site should be indexable yet.** Default is **no** — see
   "Indexing" below. `/about` and `/resume` still contain visible
   `[To fill in: ...]` placeholder text.

---

## What this is

A static site. Astro, no framework, no database, no server-side runtime. The
build output is a folder of plain HTML, CSS, fonts and images. Serving it is
"point a web server at this directory."

Seven pages, ~160 KB of assets, 5.9 KB of JavaScript total.

---

## Architecture you are implementing

```
Brandon's Mac                 tank (you)                      internet
┌─────────────┐              ┌──────────────────────┐        ┌──────────┐
│ npm run     │  transport   │ /var/www/brandon...  │ tunnel │          │
│ build       │ ───────────▶ │ Caddy serves :80     │ ─────▶ │ visitors │
└─────────────┘              │ cloudflared dials out│        └──────────┘
                             └──────────────────────┘
```

**Why a Cloudflare Tunnel and not port forwarding.** Brandon is a minor and the
site carries his real name. A DNS A record pointing at this machine publishes his
home IP address, which geolocates to his neighbourhood. The tunnel makes an
*outbound* connection instead, so:

- his home IP never appears in public DNS
- no router ports are opened — the existing Minecraft forwarding is untouched
- it works behind CGNAT
- a changing residential IP breaks nothing
- HTTPS certificates are handled by Cloudflare

**Do not replace this with port forwarding.** It is a deliberate privacy
decision, not an implementation detail.

---

## Step 1 — Report back what you're working with

Before changing anything, tell Brandon:

```bash
uname -a                       # OS and architecture
cat /etc/os-release 2>/dev/null
node --version 2>/dev/null || echo "no node"
systemctl --version 2>/dev/null | head -1 || echo "no systemd"
which caddy nginx cloudflared 2>/dev/null
ip -4 addr show | grep inet    # local address, for rsync from the Mac
```

This brief assumes Linux with systemd. **If tank is Windows or macOS, say so and
stop** — the service setup differs and Brandon should decide how to proceed.

Also note what else is running. A Minecraft server uses port 25565; the web
server needs 80. They do not conflict, but confirm nothing else holds 80.

---

## Step 2 — Get the files here

Two transports. Pick based on whether Node is installed.

### Option A — git clone and build here (needs Node 22+)

Self-sufficient: you can rebuild without Brandon's Mac being on.

```bash
git clone <REPO-URL> ~/brandongreene-site
cd ~/brandongreene-site
npm ci
npm run build        # output lands in ./dist
```

`<REPO-URL>` does not exist yet — Brandon has to create the remote. See
"Creating the remote" at the bottom of this file.

### Option B — receive a prebuilt folder (no Node needed)

Brandon runs `npm run deploy` on his Mac, which builds, runs the accessibility,
link and budget checks, and rsyncs `dist/` here. You only need the destination
directory to exist and be writable, plus SSH access from his Mac.

```bash
sudo mkdir -p /var/www/brandongreene
sudo chown -R "$USER":"$USER" /var/www/brandongreene
```

**Option B is the lower-risk default.** It keeps the verification gate on the
Mac, so a build that fails accessibility checks never reaches the server.

---

## Step 3 — Web server

Install Caddy. Chosen over nginx because it obtains and renews HTTPS
certificates by itself, with no certbot job to forget about.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Copy `deploy/Caddyfile` from this repo to `/etc/caddy/Caddyfile`. **Change the
domain on the first line.** Then:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
curl -sI http://localhost | head -1      # expect HTTP/1.1 200
```

The Caddyfile already handles clean URLs, the 404 page, immutable caching for
fingerprinted assets and fonts, revalidating HTML, and a content security policy
matching the fact that the site loads nothing from third parties.

If nginx is already installed and in use, `deploy/nginx.conf` is the equivalent,
with install notes at the top. You will need certbot for HTTPS in that case.

---

## Step 4 — Cloudflare Tunnel

Free, no plan upgrade.

Brandon must first add the domain to Cloudflare (dashboard → Add a site → Free)
and repoint the nameservers at his registrar. That is his step, not yours.

Then here:

```bash
curl -L https://pkg.cloudflare.com/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

cloudflared tunnel login                   # prints a URL for Brandon to authorise
cloudflared tunnel create brandongreene    # note the tunnel ID
cloudflared tunnel route dns brandongreene <DOMAIN>
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: brandongreene
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: <DOMAIN>
    service: http://localhost:80
  - hostname: www.<DOMAIN>
    service: http://localhost:80
  - service: http_status:404
```

Survive reboots — **important, this machine goes down roughly weekly**:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl enable caddy
```

---

## Indexing — read before you finish

The site has a **build-time** switch that keeps it out of search engines. It is
set on Brandon's Mac when building, **not here**. Setting anything on this
server will not change it.

```bash
PUBLIC_ALLOW_INDEXING=false npm run deploy     # on his Mac
```

That makes every page send `noindex, nofollow` and `/robots.txt` serve
`Disallow: /`.

**Default to indexing disabled.** `/about` and `/resume` currently display
`[To fill in: ...]` markers. This site is for college admissions readers two
years from now; a half-finished page indexed under his real name is a long-lived
cost. Only remove the flag when Brandon explicitly confirms the pre-launch
checklist in `DEPLOY.md` is done, including that his parents have seen it.

Check which mode is live:

```bash
curl -s https://<DOMAIN>/robots.txt
```

---

## Verify

```bash
curl -sI https://<DOMAIN> | head -1              # 200
curl -sI https://<DOMAIN>/projects | head -1     # 200, clean URL works
curl -sI https://<DOMAIN>/nope | head -1         # 404
curl -s  https://<DOMAIN>/robots.txt             # expected indexing mode
curl -sI https://<DOMAIN>/og/foot-scanner.png | head -1   # 200, social card
```

Then ask Brandon to open it on his phone. That check cannot be done from here.

---

## Troubleshooting

**Nothing loads.** Isolate the two services:

```bash
sudo systemctl status caddy cloudflared
curl -sI http://localhost | head -1
```

If localhost works and the domain doesn't, the problem is the tunnel or DNS. If
localhost fails too, it's Caddy or the files.

**404 on `/projects` but `/projects/` works.** The `try_files` directive is wrong
— compare against `deploy/Caddyfile`.

**Stale content.** HTML is set to revalidate, so this is usually browser cache.
Cloudflare also caches: purge from the dashboard under Caching → Purge Everything.

**Certificate errors on a `.dev` domain.** `.dev` is HSTS-preloaded, so browsers
refuse plain HTTP entirely. Through the tunnel Cloudflare terminates TLS; check
the domain's SSL/TLS mode in Cloudflare is **Full**, not Flexible.

---

## Creating the remote (Brandon's step, on his Mac)

The repository is local-only and has no remote. No `gh` CLI is installed and no
SSH keys exist on his Mac, so this cannot be automated — he has to do it:

1. Create an empty repo at <https://github.com/new>. No README, no .gitignore —
   the repo already has both. Public or private both work.
2. Then on his Mac:

```bash
cd ~/code/brandongreene-site
git remote add origin https://github.com/<USERNAME>/brandongreene-site.git
git push -u origin main
```

macOS keychain will prompt for credentials on first push. GitHub requires a
personal access token rather than a password.

The repo has been scanned: no secrets, no credentials, no email address, no
phone number in tracked files. `deploy/deploy.env` — which would hold this
machine's address — is correctly gitignored and must stay that way.

---

## Constraints that are not yours to change

- No port forwarding; the tunnel exists for a privacy reason.
- Do not enable indexing without Brandon's explicit go-ahead.
- Do not commit `deploy/deploy.env`, scan data, or anything under `data/`.
- Do not edit site content. If copy looks wrong, report it — the site has strict
  rules about never stating unverified claims, and the content was written
  against evidence.
