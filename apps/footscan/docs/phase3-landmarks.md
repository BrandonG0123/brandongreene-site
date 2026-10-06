# Phase 3 — Landmarks

> Not a medical device. See [SAFETY.md](SAFETY.md). Phase 3 places the
> anatomical landmarks that every measurement and every later design
> decision depends on. It designs and prints nothing.

## What it does

In the studio, *Landmarks* on a foot capture (or a customer's scan) opens the
3-D model in a viewer. Click each landmark on the sticker you placed on the
skin (protocol section 3). Save, and the Phase 0 measurements come back
straight away: arch height index, navicular height, rearfoot and calcaneal
angles (and forefoot–rearfoot for non-weight-bearing scans).

Each complete set of clicks is a **pick**, saved as
`<capture>/landmarks/pick-<n>.json` in the same format `footscan measure`
already reads, so a pick *is* a Phase 0 scan record.

```bash
.venv/bin/footscan export-measures -o data/raw/scan_trials.csv
.venv/bin/footscan repeatability data/raw/*.csv -o reports/phase0.md
```

Or *Download measurements CSV* via `/api/measurements.csv` in the studio.
Only research captures are exported: customers' scans are not part of
your repeatability study.

## The landmarks

| Landmark | Scans | Used for |
|---|---|---|
| Navicular tuberosity | all | navicular height |
| 1st / 5th MTP joint | all | foot axis, truncated foot length (AHI) |
| Medial / lateral malleolus | all | "up" sanity, heel search, ankle reference |
| Heel line, lower / upper dot | all | calcaneal angle |
| Leg line, lower / upper dot | all | rearfoot angle |
| Under heel, 1st and 5th met heads | non-weight-bearing | plantar plane, forefoot–rearfoot angle |
| Back of the heel | optional | origin; found from the surface if not clicked |
| Three floor points | imported standing scans only | the floor, when there's no mat |

Your spec's "calcaneal centre" is *under the heel* for non-weight-bearing
scans. In a standing scan the heel centre is on the floor, out of sight; the
insole's heel cup will be placed from the footprint outline (Phase 2)
instead.

## How the viewer helps you be repeatable

- **Snap to the sticker.** A click finds the coloured sticker under it and
  uses its centre: vertices that differ in colour from the surrounding skin
  are the sticker, their average is carried back onto the surface (the exact
  closest point on the triangles, not the nearest mesh corner). It works on
  reconstructions because the mesh now carries colour from the photos.
  Without a sticker there, the click stays where it was and says so.
- **Turn to each landmark.** The view swings to the side the next landmark
  is on (inside, outside, back), framed the same way every time.
- **Blind re-picks.** *New pick* hides earlier picks, so a re-pick doesn't
  copy the last one. Picking error (protocol section 5) is only measurable
  if the picks are independent.
- **Clicks are deliberate.** Only a still left click (or one-finger tap)
  places a landmark; pinches, two-finger taps, drags and right-clicks never
  do. Right-click, or press and hold, turns the view around that point.
- **Imported scans lying on their side.** *Turn upright* cycles which way is
  up; once the three floor points are clicked, the floor sets it.
- **Stale picks.** Each pick records the SHA-256 of the mesh it was clicked
  on. Rebuild the model and old picks are marked stale and left out of the
  export, rather than silently measured on a surface they don't sit on.

## Geometry

- **Clicking a point** casts a ray from the camera through the pixel and
  finds the nearest triangle it crosses (Möller–Trumbore ray–triangle test,
  every triangle, a few milliseconds per click).
- **Back of the heel** (if not clicked): forward is from under the ankle
  bones toward the midpoint of the 1st and 5th MTP joints, flattened onto
  the floor. The heel is the surface point farthest backward among those
  below the ankle bones. Moving the heel moves "forward" slightly, so this
  repeats until the point stops moving.
- **The floor**: the mat plane for reconstructions (z = 0); three clicked
  floor points for imported LiDAR scans (plane through three points: normal
  = (B − A) × (C − A)).
- **Measurements** are the Phase 0 definitions (`measures.py`): unchanged,
  so manual, scan and future measurements are the same numbers.

## What was tested, and what wasn't

Tested on a **synthetic** block "foot" (`tests/synth.py`) whose
measurements are known exactly: AHI 25/180, navicular height 18 mm,
calcaneal angle atan(2/14) = 8.13°. With the landmarks placed exactly, the
code reproduces them (to 0.05 mm and 0.05°), for left and right feet, turned
on the mat, and through `footscan measure` reading the saved file.

Clicked by hand in the browser on the same block with painted stickers:

| | navicular height | calcaneal angle |
|---|---|---|
| truth | 18.0 mm | 8.13° |
| clicks, no snapping | 18.4 mm | 10.7° |
| deliberately off-centre clicks, snapped (older nearest-corner snap on a 2 mm mesh) | 18.1 mm | 8.4° |

The angle row is the lesson: the two heel dots were 14 mm apart, so half a
millimetre of click error turned into 2.5°. **Put the bisection dots as far
apart as the anatomy allows**, and use snapping.

Not tested: real stickers on real skin through a real reconstruction. The
colour threshold (60 RGB levels from the surrounding skin) is a first guess
that real scans will confirm or change.
