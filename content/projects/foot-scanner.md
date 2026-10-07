---
title: Foot scanner for custom orthotics
summary: A phone-based scanning pipeline for making custom foot orthotics, built because I have flat feet and play tennis.
status: in-progress
areas: [hardware, software, research]
started: 2026-09-11
updated: 2026-09-25
featured: true
collaboration: solo
links: []
model:
  src: /models/footscan-calibration-object.stl
  description: The footscan calibration object, a 150 by 70 by 35 millimetre block with a dome, a ramp and two terraces, shown as a glowing wireframe.
  caption: The calibration object, 150 × 70 × 35 mm. It gets 3D printed, measured with calipers, and then scanned, so the scanner's error can be checked against a shape whose true dimensions are known.
---

<!--
  DRAFT — Brandon, read this before it goes anywhere.

  I wrote this from your footscan repo, not from imagination. Every claim here
  traces to something in the code, the README, docs/phase0-protocol.md, or the
  git history. I have invented nothing.

  Things I need you to confirm or fix are marked CHECK: in comments below.

  Missing: an image. Section 3 of your own template says a real image, diagram
  or short video goes near the top. The obvious candidates are a photo of the
  printed mat with a foot on it, or a screenshot of the capture page mid-scan.
  Put one in content/projects/ and I'll wire it up.
-->

## The problem

I have flat feet and I play tennis. Custom orthotics are made to the shape of
one specific foot, and that custom fit is most of what makes them expensive.

The interesting question isn't whether a 3D printer can make an insole — it
obviously can. It's whether the *measurement* can be made cheap enough to be
worth doing. A device built from a bad scan is worse than no device, because an
orthotic changes how load travels through your whole leg. Posting an arch wrong
can move a problem to the knee or hip instead of solving it.

So the deliverable is the scan-to-device pipeline, not a single insole.

## The decision the project is built around

Before building anything that produces an insole, I'm answering a narrower
question first:

> If I measure my foot ten times, how much do the answers disagree with
> each other?

If that spread is larger than the correction I'm trying to make, then any device
built from a single scan is built partly from noise — and no amount of good CAD
downstream fixes that.

That check is Phase 0, and it gates everything else. There are eight phases;
nothing past Phase 1 gets built until Phase 0 passes.

| # | Phase | Status |
|---|---|---|
| 0 | Measurement protocol and repeatability study | Built, awaiting real data |
| 1 | Marker mat and guided capture page | Capture page built; mat and LiDAR import next |
| 2 | Reconstruction and accuracy study | Not started |
| 3 | Landmark viewer | Not started |
| 4 | Parametric generator and zonal lattice | Not started |
| 5 | Lattice compression testing | Not started |
| 6 | Pressure validation | Not started |
| 7 | Fit iteration and writeup | Not started |

## How it works

**Turning photos into millimetres.** A phone camera gives you pixels, not
measurements. So every scan includes a printed marker mat in frame. The markers
give the software a known real-world scale and tell it where the camera was for
each photo.

Printers lie about scale — "fit to page" silently shrinks everything — so the
mat has a 100 mm check bar that the person measures with a ruler before
scanning. If their printout is wrong, we find out before the data is
contaminated rather than after.

**Three capture conditions, because a foot isn't one shape.** A foot is a
mechanism, and its shape depends on load and on how the subtalar joint sits.
The pipeline captures three distinct conditions and keeps them separate:

- **Non-weight-bearing, subtalar neutral** — the foot's structural shape with
  no body weight. The classic basis for plaster-cast orthotics. It's also the
  only condition where the sole is visible to the camera.
- **Semi-weight-bearing** — seated, foot on a bathroom scale on the mat, *with
  the scale reading recorded*. Writing down the load is what makes this a
  measurement instead of a vague description. This is roughly the condition
  commercial foam-box impressions are taken in.
- **Full weight-bearing** — standing, weight evenly split, scale reading again.
  The functional shape, which for a flat foot is also the collapsed shape.

**Measurements and statistics.** From the reconstructed foot the code computes
arch height index, navicular height, and rearfoot, calcaneal and
forefoot–rearfoot angles, all in a foot coordinate frame fitted to the scan
rather than to the camera. The repeatability side computes standard deviations
with confidence intervals, MDC95, and a nested variance decomposition that
separates session-to-session variation from capture-to-capture and
landmark-pick variation — so when the numbers disagree, I know *which* step is
noisy.

**The gate is explicit.** The report ends with a pass/fail for each
measurement, comparing the noise against the size of the change I actually want
to make:

```
PASS      noise < 0.5 × effect
MARGINAL  0.5 × effect ≤ noise < effect
FAIL      noise ≥ effect
```

Writing the failure condition down in advance is the point. It's much harder to
talk yourself past a threshold you committed to before you saw the data.

## What exists right now

A working local web app with two sides, served from my own computer:

- **A scan page** for the person being fitted — safety confirmations, guided
  capture with an on-screen arrow, spoken cues and sounds for where to move
  next, and a break-in guide.
- **A studio page** for me — incoming submissions with photos and scan quality,
  status tracking, and the Phase 0 research capture tools. It only answers my
  own computer, or my phone via a private link.

Also built: a rescan flow that asks someone to redo specific shots without
repeating the whole questionnaire; 3D model import for OBJ, PLY, STL, GLB and
OFF files, which auto-detects metres versus millimetres so LiDAR scans from
phone apps can be compared against photo scans; and an "object" capture mode
that exercises the camera and upload path with any household object, marked
unmeasurable so it can never leak into foot data.

## Evidence, and what I can't claim yet

Fourteen commits between 16 and 25 September 2026. The measurement and
statistics code is covered by 52 Python tests plus three JavaScript test files:
geometry is checked against hand-built synthetic feet with known answers, under
randomised camera poses and left/right mirroring, and the statistics are checked
against simulated data with known variance components.

**There is no repeatability or accuracy number for this project yet.** The tests
prove the mathematics is implemented correctly. They say nothing about whether a
phone camera and a printed mat can measure a real foot well enough to build
from. That answer only comes from real captures, and I haven't collected them.

I'd rather say that plainly than put a number here that came from simulated
data.

## What I got wrong, and what the constraints forced

**I designed a capture condition I can't perform alone.** Holding a foot in
subtalar neutral requires someone else to palpate the talar head and position
it — you cannot do it to your own foot while also operating a camera. Rather
than quietly capture something easier and call it the same thing, the protocol
now has a separate label for the relaxed version I *can* do alone, and the
analysis keeps the two apart. Two conditions that get averaged together are
worse than one condition measured honestly.

**I assumed printers print at the size you ask for.** They don't. That's what
the 100 mm check bar is for, and it exists because the alternative is a whole
dataset silently scaled wrong with nothing to reveal it.

<!--
  CHECK: the two items above are real design responses I traced from the repo —
  the nwb/nwb_relaxed split in docs/phase0-protocol.md, and the check bar in
  the README. But YOU know whether they were genuinely surprises or whether you
  planned them from the start. If you planned them, this section is overclaiming
  and we should replace it with something that actually went wrong. What has
  cost you the most time so far?
-->

## Scope and safety

This is an engineering project about measurement and fabrication cost. It is
not a medical device and is not presented as one, it makes no claim of
equivalence to a prescribed orthotic, and nothing produced by it goes into a
tennis shoe without a clinician signing off first. Any result from it would be
a single unblinded case study on my own feet, which is not evidence about
anyone else.

<!--
  CHECK: dates. The site says this started 11 Sept 2026, which is what you told
  me. The first commit is 16 Sept. If 11 Sept is when you started thinking about
  it and 16 Sept is when code began, that's fine and worth keeping — but confirm.

  CHECK: links. The repo has no git remote, so there's nothing to link to. If
  you push it to GitHub, this gets a repo link. Before you do: data/submissions,
  data/captures, data/raw and .studio_key are all gitignored, which is correct —
  keep it that way, and never commit anyone else's scan photos.
-->
