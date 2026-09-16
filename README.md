# footscan — phone scan to printed foot orthotic

> ## ⚠️ This is not a medical device
>
> It must never be presented as one. A foot orthotic changes how load
> travels through the whole kinetic chain; posting an arch wrong can move a
> problem to the knee, hip or back rather than solving it, and playing tennis
> on a bad device compounds it fast.
>
> - **A clinician reviews anything worn for sport.** The pipeline produces a
>   summary sheet for a podiatrist, sports-medicine doctor or athletic trainer
>   to sign off. No sign-off, no sport.
> - **Break-in protocol:** 1 hour on day one, ramping over two weeks, skin check
>   after every session, and **stop immediately on any new pain**.
> - **No equivalence claims.** This device is never compared to, or described
>   as equivalent to, a prescribed orthotic.
> - **n = 1, unblinded.** Results are a case study, not evidence.
>
> Full requirements: [docs/SAFETY.md](docs/SAFETY.md). They are not optional
> and are not removed in later revisions.

A personal engineering project: I have flat feet and play tennis. The
deliverable is the **scan-to-device pipeline**, not a single insole, and it
starts with proving the measurements are repeatable before any CAD.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 0 | Measurement protocol + repeatability study | **built — awaiting real data** |
| 1 | Marker board PDF + guided capture page (+ LiDAR path) | **capture page built; board, LiDAR import next** |
| 2 | Reconstruction (COLMAP/Meshroom) + accuracy study | not started |
| 3 | Landmark viewer | not started |
| 4 | Parametric generator (CadQuery) + zonal lattice | not started |
| 5 | Lattice coupon compression testing | not started |
| 6 | Pressure validation | not started |
| 7 | Fit iteration + writeup ([docs/fit-log.md](docs/fit-log.md)) | not started |

## Website (local)

Two sides, served from your own computer:

- **Scan page** (`/`) for the person being fitted: confirm the safety points,
  scan each foot with guided capture, send. That's all they see, plus a
  break-in guide (`/care.html`).
- **Studio** (`/studio/`) for you: incoming submissions with photos and scan
  quality, status tracking, the insole pipeline, and the Phase 0 research
  capture tools. The studio only answers this computer, or your own phone once
  you've opened the private studio link.

```bash
.venv/bin/footscan serve --host 0.0.0.0 --https
```

It prints three addresses: the studio on this computer, the scan page to
share with people on your Wi-Fi, and a private studio link for your phone.
Phones need HTTPS for the camera, so each phone shows a certificate warning
once.

Try the scan flow on a laptop with a simulated camera (nothing is sent):
http://localhost:8765/?demo=1

**Scan mat.** Scans need the printed mat (`web/mat/`, Letter or A4) in view:
its markers turn photos into millimetres and tell the scanner exactly where
the camera is. People measure its 100 mm check bar before scanning, which
catches printers that shrink the page. After changing the layout in
`src/footscan/mat.py`, regenerate the served files:

```bash
.venv/bin/footscan mat
```

**Not built yet:** turning scans into a TPU print file. That needs
reconstruction, landmarks and the generator (Phases 2–4), and the Phase 0
repeatability gate has to pass first.

JavaScript tests (frame quality, coverage, and camera position from the mat):

```bash
node --test "tests/js/*.test.mjs"
```

## Phase 0

Read [docs/phase0-protocol.md](docs/phase0-protocol.md) first: capture
conditions, why podiatry disagrees about them, marker placement, manual
reference measurements, study design, and the go/no-go gate.

```bash
uv venv && uv pip install -e ".[dev]"
```

```bash
.venv/bin/python -m pytest -q
```

**Manual measurements** (can start today, no scanner needed): copy
`data/templates/manual_trials.csv` into `data/raw/`, fill it in, then

```bash
.venv/bin/footscan repeatability data/raw/manual_trials.csv -o reports/phase0-manual.md
```

**Scan measurements** (once Phases 1–3 produce meshes + landmarks): one JSON
per scan following `data/templates/scan_landmarks.json`, then

```bash
.venv/bin/footscan measure data/scans/*.json -o data/raw/scan_trials.csv
```

```bash
.venv/bin/footscan repeatability data/raw/*.csv -o reports/phase0.md --target ahi=0.02 --device-condition swb
```

### Code map

- `src/footscan/frame.py` — foot coordinate frame (reference plane, long
  axis, medial axis); explains plane fitting and projection
- `src/footscan/measures.py` — AHI, navicular height, rearfoot,
  calcaneal and forefoot–rearfoot angles; explains mesh slicing and
  frontal-plane angles
- `src/footscan/repeatability.py` — SD with confidence intervals, MDC95,
  nested variance decomposition (session / capture / pick), condition
  differences, arch height flexibility, gate
- `src/footscan/report.py` — markdown report, safety banner included
- `tests/` — geometry checked against hand-built feet with known answers
  under random scanner poses and left/right mirroring; statistics checked
  against simulated data with known variance components

The tests use synthetic geometry and simulated data to verify the maths.
**No repeatability or accuracy number exists for this project yet** — they
will come only from real captures.
