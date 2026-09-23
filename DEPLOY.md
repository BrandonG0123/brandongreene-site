# Deploying

Written so you can do this yourself. I can't create accounts or enter
credentials on your behalf, so every step below is one you run.

Read the whole thing once before starting. Step 0 matters most.

---

## Step 0 — Decide whether this should be public yet

The site currently contains:

- **six placeholder slots** (dev-only, stripped from every production build — these
  cannot reach the live site, verified in CI)
- **`[To fill in: ...]` markers** on `/about` and `/resume` — these *are* real
  page content and **will** be publicly visible
- draft copy on the home page written from one interview

None of that is dishonest, but a reader landing on `/resume` today sees square
brackets where your tennis results should be.

**Recommended: deploy now, but keep it out of search.** You get the pipeline
working, a real URL to test on your actual phone, and preview builds per pull
request — without a half-finished page being indexed under your name for the
next two years. Set one environment variable (Step 4) and the whole site sends
`noindex` plus a `Disallow: /` robots.txt. Flip it when the content is ready.

**Also: show your parents before you make it indexable.** You're a minor
publishing under your real name. Your brief already sets the privacy rules —
this is the last mile on them.

---

## Step 1 — Pick and buy the domain

`brandongreene.com`, `.net` and `.me` are taken. As of 23 Sept 2026 these
appeared unregistered:

| Domain | Note |
|---|---|
| `brandongreene.dev` | Recommended. Reads as deliberate for a programmer. `.dev` is HTTPS-only, which is fine — this site is HTTPS anyway. |
| `brandongreene.io` | Fine, though `.io` renews expensively. |
| `brandon-greene.com` | Hyphens are awkward to say out loud. |

**Re-check availability at the registrar before you get attached to one** — my
check was a whois lookup, not a purchase, and names get taken.

Buy from Cloudflare Registrar (at-cost, no markup, free WHOIS privacy) or
Namecheap. **Turn WHOIS privacy on** — without it your registration details are
public, and you shouldn't publish a home address.

Then set it in one place:

```js
// astro.config.mjs
export const SITE = 'https://brandongreene.dev';
```

Canonical URLs, the sitemap, RSS, robots.txt and the résumé header all derive
from that single value.

---

## Step 2 — Put it on GitHub

```bash
cd /Users/bgreene/code/brandongreene-site
git remote add origin https://github.com/<your-username>/brandongreene-site.git
git branch -M main
git push -u origin main
```

Create the repo at <https://github.com/new> first. **Public or private both
work** — Cloudflare Pages can build either. Public is fine and shows your
commit history, which is itself evidence of sustained work. Private is fine too
if you'd rather not have the drafts visible.

CI (`.github/workflows/ci.yml`) starts running on that first push.

---

## Step 3 — Connect Cloudflare Pages

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages**
   → **Connect to Git**
2. Authorise GitHub, pick the repo
3. Build settings:

   | Field | Value |
   |---|---|
   | Framework preset | Astro |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | `22` (add env var `NODE_VERSION=22`) |

4. **Save and Deploy**

You get `<project>.pages.dev` in about a minute. Every pull request
automatically gets its own preview URL — that's the per-PR preview build your
brief asked for, and it needs no extra configuration.

---

## Step 4 — Keep it out of search until you're ready

In Cloudflare Pages → **Settings** → **Environment variables**, add to
**Production**:

```
PUBLIC_ALLOW_INDEXING = false
```

That does two things: every page gets `<meta name="robots" content="noindex,
nofollow">`, and `/robots.txt` serves `Disallow: /`. Both matter — robots.txt
alone doesn't remove a page that was discovered some other way.

**Delete this variable when you launch.** Put a reminder somewhere; it is
exactly the kind of thing that gets forgotten for a year.

---

## Step 5 — Custom domain and DNS

### If you bought the domain at Cloudflare

Pages → your project → **Custom domains** → **Set up a domain** → enter it.
Cloudflare writes the DNS record itself. Done in about a minute.

### If you bought it elsewhere

1. Add the domain to Cloudflare: dashboard → **Add a site** → enter the domain →
   Free plan
2. Cloudflare gives you two nameservers, e.g. `dana.ns.cloudflare.com`
3. At your registrar, replace the existing nameservers with those two
4. Wait for propagation — usually under an hour, occasionally up to 24
5. Back in Pages → **Custom domains** → add both `brandongreene.dev` and
   `www.brandongreene.dev`

Cloudflare creates the records for you. If you ever need them by hand:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | `<project>.pages.dev` | Proxied |
| CNAME | `www` | `<project>.pages.dev` | Proxied |

HTTPS certificates are issued automatically. Check with:

```bash
dig brandongreene.dev +short
curl -sI https://brandongreene.dev | head -1
```

---

## Step 6 — Verify on real hardware

The emulated viewport testing I did is accurate for layout and text metrics. It
is **not** a real iPhone. Once you have a URL:

- Open it on your actual phone. Check the header, the project list, and tap
  targets with your thumb rather than a mouse.
- Open it on the iPad, portrait and landscape.
- Check both themes by flipping the OS appearance setting.
- Print `/resume` to PDF from Safari and confirm it is one page.

---

## Step 7 — Pre-launch checklist

Do not remove `PUBLIC_ALLOW_INDEXING=false` until every line is ticked.

- [ ] Every `[To fill in: ...]` marker is gone from `/about` and `/resume`
- [ ] Contact method is a real alias, never a personal email in plain text
- [ ] Unused `slot-*.md` files deleted from `content/projects/`
- [ ] `npm test` passes (build, axe, links, budget)
- [ ] `npx lhci autorun` passes (accessibility and performance ≥ 95)
- [ ] Manual accessibility pass run — `docs/manual-a11y-test.md`, all five passes
- [ ] Every image has real alt text describing what matters about it
- [ ] Spelling pass, read out loud
- [ ] `/resume` prints to exactly one page
- [ ] Checked on a real phone and a real iPad
- [ ] No home address, phone number, school schedule or daily routine anywhere
- [ ] No photos of other people without their permission
- [ ] Every claim on the site is something you actually did, with no invented
      numbers, and group work is labelled with your specific contribution
- [ ] **Parents have seen it**
- [ ] `PUBLIC_ALLOW_INDEXING` deleted from Cloudflare

---

## Rolling back

Cloudflare Pages keeps every deployment. Pages → **Deployments** → find a
known-good one → **Rollback**. Takes seconds and needs no git surgery.
