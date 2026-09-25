# Deploying to your own server

You're hosting on your own machine. This is written for that.

I can't create accounts or enter credentials for you, so every step here is one
you run. Read it once before starting.

---

## What you're setting up

```
your Mac                      your extra computer            the internet
┌──────────────┐              ┌────────────────────┐         ┌──────────┐
│ npm run      │   rsync      │  /var/www/...      │ tunnel  │          │
│ deploy       │ ──────────▶  │  Caddy serves it   │ ──────▶ │ visitors │
└──────────────┘   over SSH   │  cloudflared dials │         └──────────┘
                              │  out to Cloudflare │
                              └────────────────────┘
```

The site is a folder of plain files. No Node on the server, no database, no
build step there. `npm run deploy` builds on your Mac, runs the same checks CI
runs, and copies the result over.

**Why a tunnel instead of port forwarding.** `cloudflared` makes an *outbound*
connection from your machine to Cloudflare, and Cloudflare serves your domain
from it. That means:

- your home IP address never appears in public DNS
- no ports opened on your router — your Minecraft server's forwarding is untouched
- works behind CGNAT, where inbound connections are impossible
- your IP can change and nothing breaks
- HTTPS certificates are handled for you

Your brief says no information that identifies where you are. A DNS record
pointing at your house is exactly that, permanently and publicly. This avoids it
without giving up hosting it yourself.

**The known tradeoff:** when the machine is off, the site is off. You've said
you'll fix the weekly downtime. Until then, don't put the URL anywhere it gets
one shot — applications, a résumé you're handing in, an email to a teacher.

---

## Step 1 — Set the domain

One line, and canonical URLs, the sitemap, RSS, robots.txt, the résumé header
and the generated OG cards all follow:

```js
// astro.config.mjs
export const SITE = 'https://your-domain-here';
```

Tell me the domain and I'll set it, or change it yourself and run `npm run build`.

---

## Step 2 — Prepare the server

SSH into the machine.

```bash
sudo mkdir -p /var/www/brandongreene
sudo chown -R "$USER":"$USER" /var/www/brandongreene
```

Install Caddy. It's the reason I'd pick it over nginx: it gets and renews HTTPS
certificates by itself, with no certbot job to forget about.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Copy `deploy/Caddyfile` from this repo to `/etc/caddy/Caddyfile`, change the
domain on the first line, then:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy     # should say active (running)
```

*Already running nginx?* Use `deploy/nginx.conf` instead — the file has its own
install notes at the top. You'll need certbot for HTTPS.

*Port conflicts:* Minecraft uses 25565, the web server uses 80 and 443. They
don't collide.

---

## Step 3 — Cloudflare Tunnel

Free, and no account upgrade needed.

1. Add your domain to Cloudflare: <https://dash.cloudflare.com> → **Add a site**
   → Free plan. It gives you two nameservers.
2. At your registrar, replace the nameservers with those two. Propagation is
   usually under an hour.
3. On the server:

```bash
curl -L https://pkg.cloudflare.com/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

cloudflared tunnel login                    # opens a browser link to authorise
cloudflared tunnel create brandongreene     # note the tunnel ID it prints
cloudflared tunnel route dns brandongreene your-domain-here
```

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: brandongreene
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: your-domain-here
    service: http://localhost:80
  - hostname: www.your-domain-here
    service: http://localhost:80
  - service: http_status:404
```

Then run it as a service so it survives reboots:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

---

## Step 4 — Deploy

Back on your Mac, once:

```bash
cp deploy/deploy.env.example deploy/deploy.env
```

Fill in `SSH_USER`, `SSH_HOST` and `REMOTE_DIR`. **`deploy.env` is gitignored** —
it holds your machine's address and must not end up in a public repo.

Then, every time:

```bash
npm run deploy
```

That builds, runs the accessibility, link and budget checks, refuses to continue
if a placeholder slot somehow reached the build, and rsyncs `dist/` across.
`--delete` is on, so a page you remove locally actually disappears from the
server instead of lingering.

```bash
npm run deploy -- --dry-run       # see what would change, upload nothing
npm run deploy -- --skip-checks   # skip verification (don't make this a habit)
```

Set up SSH keys if you haven't — otherwise this prompts for a password every
time:

```bash
ssh-copy-id -p 22 user@your-server
```

---

## Step 5 — Keep it out of search until the content is ready

**This differs from a hosted platform, and it's easy to get wrong.** You build
on your Mac, so this is a *build-time* variable — setting it on the server does
nothing.

```bash
PUBLIC_ALLOW_INDEXING=false npm run deploy
```

Every page then carries `<meta name="robots" content="noindex, nofollow">` and
`/robots.txt` serves `Disallow: /`. Both matter — robots.txt alone won't remove
a page discovered another way.

Use this until the `[To fill in: ...]` markers are gone from `/about` and
`/resume`. To launch properly, just deploy without the variable:

```bash
npm run deploy
```

Check which mode is live:

```bash
curl -s https://your-domain-here/robots.txt
```

---

## Step 6 — Verify

```bash
curl -sI https://your-domain-here | head -1          # expect HTTP/2 200
curl -sI https://your-domain-here/projects | head -1 # clean URL works
curl -s https://your-domain-here/robots.txt
curl -sI https://your-domain-here/nope | head -1     # expect 404
```

Then on real hardware, which emulators can't replace:

- Open it on your actual phone. Check the header and tap targets with a thumb.
- Open it on an iPad, portrait and landscape.
- Flip your OS between light and dark.
- Print `/resume` to PDF from Safari — it should be exactly one page.

---

## Pre-launch checklist

Don't drop `PUBLIC_ALLOW_INDEXING=false` until every line is ticked.

- [ ] Every `[To fill in: ...]` marker gone from `/about` and `/resume`
- [ ] Contact is a real alias, never a personal email in plain text
- [ ] Unused `slot-*.md` files deleted from `content/projects/`
- [ ] `npm test` passes
- [ ] `npx lhci autorun` passes (accessibility and performance ≥ 95)
- [ ] Manual accessibility pass run — `docs/manual-a11y-test.md`, all five passes
- [ ] Every image has real alt text describing what matters about it
- [ ] Spelling pass, read out loud
- [ ] `/resume` prints to one page
- [ ] Checked on a real phone and a real iPad
- [ ] No home address, phone number, school schedule or daily routine anywhere
- [ ] Every claim is something you actually did, no invented numbers, group work
      labelled with your specific contribution
- [ ] **Parents have seen it**
- [ ] Uptime problem fixed, or the URL isn't anywhere that gets one shot
- [ ] Deployed once without `PUBLIC_ALLOW_INDEXING=false`

---

## Troubleshooting

**Site doesn't load at all.** Check the two services independently:

```bash
sudo systemctl status caddy cloudflared
curl -sI http://localhost | head -1     # is Caddy serving? (run on the server)
```

If `localhost` works and the domain doesn't, the problem is the tunnel or DNS.
If `localhost` fails too, it's Caddy or the files.

**Old version still showing.** HTML is set to revalidate, so this is usually a
browser cache. Hard-reload with Cmd+Shift+R. Cloudflare also caches — purge from
the dashboard under **Caching** → **Purge Everything**.

**404 on `/projects` but `/projects/` works.** The `try_files` line is wrong or
missing. Compare against `deploy/Caddyfile`.

**Certificate errors on a `.dev` domain.** `.dev` is HSTS-preloaded, so browsers
refuse plain HTTP entirely. Through the tunnel Cloudflare terminates TLS, so
this should just work — if it doesn't, check that the domain's SSL/TLS mode in
Cloudflare is **Full**, not Flexible.

**Rolling back.** There's no deployment history on your own server, so roll back
from git:

```bash
git log --oneline
git checkout <good-commit>
npm run deploy
git checkout main
```
