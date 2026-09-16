# Safety requirements

> **This is not a medical device and must never be presented as one.**
> It is a personal engineering project. It does not diagnose, treat, or
> prevent any condition, and it is not equivalent to, a substitute for, or
> comparable to a clinically prescribed orthotic.

## Why this matters

A foot orthotic changes how load travels through the whole kinetic chain.
Posting an arch wrong can move a problem from the foot to the knee, hip or
lower back rather than solving it. Tennis multiplies this: repeated lateral
cutting, split-steps and hard decelerations put far more load through the
device per session than walking, so a bad device compounds harm quickly.

These are **requirements**, not suggestions. They are not softened or removed
in any later revision of this project, including at the owner's request —
the reason for having them is precisely that the person building the device
is also the person most motivated to skip them.

## Requirement 1 — Clinician review before any on-court use

Nothing produced by this pipeline is worn for tennis (or any sport) until a
podiatrist, sports-medicine physician, physical therapist, or certified
athletic trainer has reviewed it and signed the handoff sheet.

The pipeline produces a printable **clinician summary sheet** (built in
Phase 4, once there is a device to describe) containing:

- scan conditions and dates, and the repeatability of each measurement
  (from the Phase 0 study) so the reviewer can see how trustworthy the
  numbers are
- arch height index, navicular height/drop, rearfoot angle,
  forefoot–rearfoot angle, per condition
- chosen device parameters: arch fill deviation, rearfoot and forefoot
  posting angles, heel cup depth, shell thickness, lattice stiffness map,
  top cover
- a sign-off block: name, credential, date, "approved for: walking only /
  training / match play / not approved", and notes

If no clinician is available, the device is **not approved for sport**. The
pipeline can still be used for measurement and research, and the device can
be worn for walking under the break-in protocol below.

## Requirement 2 — Break-in protocol (shown in the UI)

Default schedule. A clinician may replace it; nobody else may shorten it.

| Day   | Wear time                      | Activity                         |
|-------|--------------------------------|----------------------------------|
| 1     | 1 hour                         | Walking only                     |
| 2–3   | 2 hours                        | Walking only                     |
| 4–5   | 3 hours                        | Walking only                     |
| 6–7   | 4 hours                        | Walking only                     |
| 8–10  | 6 hours                        | Walking only                     |
| 11–14 | All day                        | Walking only                     |
| 15+   | —                              | Sport **only** after clinician sign-off, starting with a short, low-intensity hitting session |

**Skin check — after every wear session, both feet:**
look for redness that has not faded after 20 minutes, blisters, hot spots,
calluses forming, or pressure marks at the arch edge, heel cup rim, and under
the met heads. Log it (Phase 5 comfort log).

**Stop rule — explicit:**
Stop wearing the device immediately and do not resume until reviewed if any
of the following occur:

- **any new pain** — foot, ankle, shin, knee, hip or back — that was not
  present before starting to wear the device
- a skin check finding that has not resolved by the next day
- numbness, tingling, or burning
- any existing pain that gets worse

"Push through it" is never the right answer for a new device. A stop is not a
failure; it is a data point for `docs/fit-log.md`.

## Requirement 3 — No equivalence claims

Never compare this device to, or claim equivalence with, a prescribed
orthotic — in the README, the UI, the writeup, or conversation.

Phase 5 includes scanning an existing clinical orthotic, if one exists, to
compare **geometry**. That comparison is reported as "how the shapes differ",
never as "mine is as good as" or "matches" the clinical device. Matching
geometry says nothing about clinical appropriateness.

## Requirement 4 — Honest evidence

- Every accuracy, repeatability, pressure, or stiffness number comes from a
  real run. No placeholder or illustrative numbers in results.
- n = 1 and unblinded: comfort and pressure results are a **case study**, not
  evidence of efficacy. The writeup says so plainly.
