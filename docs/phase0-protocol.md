# Phase 0 — Measuring a foot repeatably

> Not a medical device. See [SAFETY.md](SAFETY.md). Phase 0 fabricates
> nothing; it establishes whether the numbers are good enough to build from.

The first question is not "what shape should the orthotic be?" but "if I
measure my foot ten times, how much do the answers disagree with each
other?" If that spread is larger than the correction you want to make, any
device built from one scan is built partly from noise.

---

## 1. The three capture conditions

The foot is not one shape. It is a mechanism whose shape depends on load
and on how the subtalar joint is positioned. The three conditions below
differ in exactly those two things.

### A. Non-weight-bearing, subtalar joint neutral (`nwb`)

**Setup.** Prone on a table, feet hanging off the end. A helper palpates
the talar head (thumb and finger either side, just in front of the ankle)
and moves the foot until it feels equally prominent medially and laterally
— "subtalar joint neutral" (STJN). They then load the 4th–5th met heads
gently dorsally until the forefoot resists ("locking the midtarsal joint").

**What it captures.** The foot's *structural* shape with the joints placed
in a reference position and no body weight. This is the shape from which
the Root school derives forefoot varus/valgus, and it is the classic basis
for plaster-cast orthotics.

**Practical constraint.** You cannot hold your own foot in STJN and scan
it. This condition needs a second person. If you capture NWB alone (e.g.
seated, foot relaxed), label it `nwb_relaxed`, not `nwb` — it is a
different condition and the analysis keeps them separate.

**This is the only condition where the plantar surface is visible to the
camera**, so it is the only one that gives plantar landmarks directly.

### B. Semi-weight-bearing (`swb`)

**Setup.** Seated, hips and knees at ~90°, shank vertical, foot resting on
a bathroom scale placed on the marker board. **Record the scale reading** —
that is the load, and it makes this condition quantitative instead of
vague.

**What it captures.** The foot under a small, partial load: enough to seat
the heel pad and let the forefoot contact the ground, not enough to fully
collapse the arch. Foam-box impressions are taken in roughly this condition,
which is why most commercial orthotic labs work from something like it.
(A foam-box impression, scanned, is a cheap semi-weight-bearing *negative*
of your plantar surface — worth trying as an extra capture path.)

### C. Full weight-bearing (`fwb`)

**Setup.** Relaxed bilateral stance, weight evenly split, feet at natural
angle and base of gait, one foot on the scale on the marker board, the
other on a block of equal height. **Record the scale reading.**

**What it captures.** The functional shape of the foot under standing load
— what the foot actually does. For a flat foot, it is also the *collapsed*
shape.

**The plantar surface is against the floor and cannot be photographed.**
Everything measurable in FWB comes from the medial, lateral, dorsal and
posterior views, with the floor (the marker board plane) standing in for the
plantar reference plane.

---

## 2. Why podiatry disagrees — and why you can measure it

This disagreement is the interesting question in the project, so it is
worth being precise about what each side claims.

**The Root / subtalar-neutral model** (Root, Orien, Weed and colleagues,
1970s). The foot has an ideal "neutral" alignment; deviations from it
measured non-weight-bearing (forefoot varus, rearfoot varus) cause
compensatory motion under load (e.g. excess pronation), and the orthotic
should hold the foot near neutral. So: *cast NWB in STJN*, because that is
the reference shape you want to restore.

**The critiques.**
- *Reliability.* STJN positioning and the NWB forefoot/rearfoot angles have
  repeatedly shown poor inter-rater and only moderate intra-rater
  reliability. If the reference position is not reproducible, a device
  built on it inherits the noise.
- *Validity.* Population studies found that most asymptomatic feet fall
  outside Root's "normal" criteria, which undermines the idea that those
  criteria define pathology.
- *Function.* Newer frameworks (the tissue-stress model; Kirby's subtalar
  axis / rotational equilibrium model; Nigg's "preferred movement pathway")
  argue the goal is to change *loads on stressed tissues*, not to restore a
  geometric neutral — which pushes toward capturing the foot closer to how
  it is loaded.

**The case against full weight-bearing.** Casting a flat foot in full
stance captures the collapse you are trying to address. A device shaped to
the collapsed arch supports the foot *where it already is*.

**Semi-weight-bearing** is the pragmatic compromise, but "semi" is usually
unquantified — which is why you record the scale reading.

**What you can measure that most clinics don't:** the same foot, scanned
repeatedly in all three conditions, gives you

1. **How much the foot's shape changes between conditions** — navicular
   drop, AHI change, rearfoot angle change.
2. **Arch height flexibility (AHF)** — change in dorsal arch height per unit
   load change between `swb` and `fwb` (mm/kN). Two people with the same
   standing AHI can have very different AHF; it plausibly matters more for a
   dynamic sport than any single static shape.
3. **Which condition is most repeatable.** If the STJN capture has twice the
   spread of the FWB capture *for you, with your helper*, that is a direct,
   personal answer to the reliability critique.

Before citing any of the above in the writeup, pull and read the primary
sources; the summary here is orientation, not a literature review.

---

## 3. Skin markers

The biggest single source of landmark error is not the camera, it is
**finding the bone under the skin**. Do not locate landmarks by eye on a
mesh. Palpate them on the body and place markers:

- 6–8 mm round colour-contrast stickers (office dot stickers work) for
  point landmarks
- a fine washable skin marker for bisection lines on the posterior heel and
  lower leg, with a sticker dot at each end of each line

The stickers show up in the scan's colour; the Phase 3 viewer snaps each
click to the sticker's centre. That converts a hard anatomical judgement
into an easy visual one. Use a colour that contrasts with skin (green or
blue), and put the two dots of each bisection line as far apart as the
anatomy allows: an angle from two dots 14 mm apart changes by about 2° for
every half-millimetre of placement error.

**Keep markers on within a session; remove and re-palpate between
sessions.** That is what lets the analysis separate palpation error from
capture error (section 6).

| Landmark key            | Where                                                         | Visible in |
|-------------------------|---------------------------------------------------------------|------------|
| `navicular_tuberosity`  | Most prominent point of the navicular tuberosity, medial foot | all        |
| `mtpj1_medial`          | Medial prominence of the 1st metatarsophalangeal joint        | all        |
| `mtpj5_lateral`         | Lateral prominence of the 5th metatarsophalangeal joint       | all        |
| `malleolus_medial`      | Most prominent point of medial malleolus                      | all        |
| `malleolus_lateral`     | Most prominent point of lateral malleolus                     | all        |
| `calc_bisect_proximal`  | Posterior calcaneus bisection, upper point (just below Achilles insertion) | all |
| `calc_bisect_distal`    | Posterior calcaneus bisection, lower point (above heel pad)   | all        |
| `leg_bisect_proximal`   | Lower-leg bisection, ~15 cm above the malleoli                | all        |
| `leg_bisect_distal`     | Lower-leg bisection, just above the malleoli                  | all        |
| `calc_plantar`          | Plantar skin under calcaneal tuberosity                       | `nwb` only |
| `mth1_plantar`          | Plantar skin under 1st metatarsal head                        | `nwb` only |
| `mth5_plantar`          | Plantar skin under 5th metatarsal head                        | `nwb` only |
| `heel_posterior`        | Most posterior point of heel (computed from mesh if present)  | all        |
| `toe_tip`               | Tip of the longest toe (computed from mesh if present)        | all        |

The Phase 3 landmark list (navicular, 1st/5th met heads, calcaneal centre,
malleoli) is a subset of this; the bisection points are extra because the
rearfoot angle cannot be defined without them.

---

## 4. Manual reference measurements

Scans are the goal, but run a **manual** measurement alongside every scan
session from day one. It costs a few minutes, needs no pipeline, and gives
Phase 2 an independent reference to check the scans against. It also means
the repeatability study can start today.

**Equipment:** a flat board, a heel stop (a block against a wall), a ruler
or tape fixed along the board, a set square, a digital caliper or depth
gauge, index card, goniometer or a phone photo.

- **Foot length / truncated foot length.** Heel against the stop. Slide the
  set square to the longest toe tip → foot length. Slide it to the centre
  of the 1st MTP joint → truncated foot length.
- **Dorsal height at 50 % foot length.** Mark 50 % of foot length on the
  board; measure the vertical height of the dorsum at that mark with the
  caliper depth rod or a set square and ruler.
- **Navicular height** (index-card method): mark the tuberosity sticker's
  height on an index card held vertically against the medial foot; measure
  the mark from the bottom edge.
- **Rearfoot angle.** Phone on a level surface at heel height, directly
  behind the heel, photo of the bisection lines. Measure the angle in any
  image tool (ImageJ is free). This is a miniature version of the whole
  pipeline and is worth doing for that reason alone.

Enter manual values into `data/templates/manual_trials.csv` (copy it into
`data/raw/` first) with `source = manual`.

---

## 5. Repeatability study design

**Per condition: N = 10 captures, spread over at least 2 sessions (days).**

Why 10 and not 3? A standard deviation estimated from few samples is itself
very uncertain. The analysis reports a 95 % confidence interval on every SD
so you can see this directly; with N = 3 the upper bound is several times
the estimate. Below N = 5 the report flags the SD as unreliable.

Structure each trial so every source of error is separable:

| Column       | Meaning                                                          |
|--------------|------------------------------------------------------------------|
| `session`    | One sticker application. New session = markers removed and re-palpated. |
| `capture_id` | One physical capture (step off, reposition, re-scan). Unique across the study. |
| `pick`       | Landmark-picking repeat on the same mesh (1, 2, 3…). Re-pick blind, ideally on a different day. |

A suggested schedule:

- 2 sessions × 5 captures × 3 conditions = 30 scans
- re-pick landmarks 3× on 2 captures per condition to estimate picking
  error

Randomise condition order within a session so fatigue and time-of-day
swelling don't correlate with condition. Note time of day — feet swell over
a day; do all sessions at a similar time.

---

## 6. What the analysis reports

For every measurement × condition × source:

- **mean, SD, 95 % CI of the SD**
- **MDC95** (minimal detectable change) = 1.96 × √2 × SD — the smallest
  change between two single measurements you can call real at 95 %
  confidence
- **variance decomposition** (when the data support it):
  picking SD, capture SD, session (palpation) SD

For every pair of conditions:

- **difference in means** and whether it exceeds measurement noise
- **navicular drop** (`nwb` or `swb` navicular height minus `fwb`)
- **arch height flexibility** (`swb` → `fwb`, using recorded loads)

**Why no ICC?** The intraclass correlation coefficient compares variation
*between* subjects to variation *within* subjects. With one foot there is no
between-subject variance, so the ICC is undefined. The SD and MDC in
millimetres or degrees are the right repeatability statistics for n = 1,
and they are more directly useful anyway.

---

## 7. The go / no-go gate

The report ends with a gate for each measurement:

    effect  = the change you want to make or detect
    noise   = single-scan MDC95 (or MDC95 / √k if the device is built from the mean of k scans)

    PASS      noise < 0.5 × effect
    MARGINAL  0.5 × effect ≤ noise < effect
    FAIL      noise ≥ effect

The effect defaults to the observed difference between conditions (e.g. AHI
`nwb` vs `fwb` — the collapse). You can also pass an explicit target, e.g.
`--target ahi=0.02` for "I intend to raise AHI by 0.02."

The 0.5 threshold is a judgement call: at noise = effect, one scan in
several will point the wrong way. Tighten it if you like; don't loosen it.

**If the gate fails for AHI, do not proceed to CAD.** Fix the measurement
first — better markers, more captures per device, a different condition,
or a better reconstruction.
