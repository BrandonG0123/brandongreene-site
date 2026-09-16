"""Markdown report for the Phase 0 repeatability study.

The report is computed only from the rows passed in. It never contains
example or placeholder numbers.
"""

from __future__ import annotations

import datetime as dt
import math

from .repeatability import (
    Summary,
    arch_height_flexibility,
    condition_differences,
    gate,
    summarize,
)

SAFETY_BANNER = """> **Not a medical device.** This report describes measurement repeatability
> for a personal engineering project. It is not a clinical assessment, and no
> device built from these numbers is to be used for sport without clinician
> review and sign-off. See docs/SAFETY.md."""

GATED_MEASURES = (
    "ahi",
    "dorsal_height_50_mm",
    "navicular_height_mm",
    "rearfoot_angle_deg",
    "calcaneal_angle_deg",
    "forefoot_rearfoot_angle_deg",
)


def fmt(x, measure: str = "") -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "—"
    digits = 4 if measure in ("ahi", "navicular_height_norm") else 2
    return f"{x:.{digits}f}"


def _pick_effect_pair(by_pair: dict):
    for a, b in (("nwb", "fwb"), ("nwb_relaxed", "fwb"), ("swb", "fwb"), ("nwb", "swb")):
        if (a, b) in by_pair:
            return by_pair[(a, b)]
    return None


def build_report(rows: list[dict], targets: dict[str, float], device_condition: str | None,
                 scans_per_device: int, inputs: list[str]) -> str:
    summaries = summarize(rows)
    diffs = condition_differences(summaries)
    ahf = arch_height_flexibility(summaries)
    k = max(1, scans_per_device)

    L = [
        "# Phase 0 — Measurement repeatability report",
        "",
        SAFETY_BANNER,
        "",
        f"Generated {dt.datetime.now().isoformat(timespec='minutes')} from "
        f"{len(rows)} measurement rows in: " + ", ".join(f"`{p}`" for p in inputs),
        "",
        "## 1. Per-condition repeatability",
        "",
        "SD is across captures (picks averaged within a capture). "
        "MDC95 = 1.96·√2·SD: the smallest change between two single scans "
        "distinguishable from noise at 95 %.",
        "",
    ]

    current = None
    for s in summaries:
        grp = (s.foot, s.source, s.measure)
        if grp != current:
            current = grp
            L += ["", f"### {s.measure} — {s.foot} foot, {s.source}", "",
                  "| condition | n | mean | SD | SD 95% CI | MDC95 | pick SD | capture SD | session SD | load kg |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
        m = s.measure
        L.append(
            f"| {s.condition} | {s.n} | {fmt(s.mean, m)} | {fmt(s.sd, m)} | "
            f"{fmt(s.sd_lo, m)}–{fmt(s.sd_hi, m)} | {fmt(s.mdc95, m)} | {fmt(s.pick_sd, m)} | "
            f"{fmt(s.capture_sd, m)} | {fmt(s.session_sd, m)} | {fmt(s.mean_load_kg)} |"
        )
    warn = [(s, w) for s in summaries for w in s.warnings]
    if warn:
        L += ["", "**Warnings**", ""]
        L += [f"- {s.measure} / {s.condition} / {s.source}: {w}" for s, w in warn]

    L += ["", "## 2. Differences between conditions", "",
          "`diff` = mean(A) − mean(B). `p` is a Welch t-test on the means: it says "
          "whether the *average* shape differs. `single-scan MDC95` says whether "
          "*one scan in each condition* would show it — the relevant question "
          "when a device is built from one scan.", "",
          "| measure | foot | source | A | B | diff | SE | p | single-scan MDC95 |",
          "|---|---|---|---|---|---|---|---|---|"]
    for d in diffs:
        m = d.measure
        label = "navicular drop (A − B)" if m == "navicular_height_mm" else m
        L.append(f"| {label} | {d.foot} | {d.source} | {d.cond_a} | {d.cond_b} | {fmt(d.diff, m)} | "
                 f"{fmt(d.se, m)} | {fmt(d.p_value, 'ahi')} | {fmt(d.mdc95_single, m)} |")
    if not diffs:
        L.append("| _need ≥2 captures in ≥2 conditions_ | | | | | | | | |")

    L += ["", "## 3. Arch height flexibility (swb → fwb)", ""]
    if ahf:
        L += ["| foot | source | Δ dorsal height mm | Δ load kN | AHF mm/kN | SE |", "|---|---|---|---|---|---|"]
        for a in ahf:
            if a["ahf"] is None:
                L.append(f"| {a['foot']} | {a['source']} | — | — | — ({a['note']}) | — |")
            else:
                L.append(f"| {a['foot']} | {a['source']} | {fmt(a['delta_h'])} | {a['delta_F_kN']:.3f} | "
                         f"{fmt(a['ahf'])} | {fmt(a['se'])} |")
    else:
        L.append("_Needs dorsal_height_50_mm in both swb and fwb._")

    L += ["", "## 4. Go / no-go gate", "",
          f"Noise is MDC95 divided by √k, with k = {k} scan(s) averaged per device. "
          "PASS: noise < 0.5 × effect. MARGINAL: < effect. FAIL: ≥ effect.", "",
          "| measure | foot | source | effect | effect basis | noise | verdict |",
          "|---|---|---|---|---|---|---|"]
    by_group: dict[tuple, dict] = {}
    for d in diffs:
        by_group.setdefault((d.foot, d.source, d.measure), {})[(d.cond_a, d.cond_b)] = d
    s_idx = {(s.foot, s.source, s.measure, s.condition): s for s in summaries}
    groups = sorted({(s.foot, s.source, s.measure) for s in summaries if s.measure in GATED_MEASURES})
    any_fail = False
    for foot, source, m in groups:
        if m in targets:
            s = s_idx.get((foot, source, m, device_condition)) if device_condition else None
            if s is None:
                L.append(f"| {m} | {foot} | {source} | {fmt(targets[m], m)} | target | — | "
                         f"INSUFFICIENT DATA (need --device-condition with data) |")
                continue
            effect, basis, noise = targets[m], f"target, device from {device_condition}", s.mdc95 / math.sqrt(k)
        else:
            d = _pick_effect_pair(by_group.get((foot, source, m), {}))
            if d is None:
                continue
            effect, basis, noise = d.diff, f"{d.cond_a} vs {d.cond_b}", d.mdc95_single / math.sqrt(k)
        verdict = gate(effect, noise)
        any_fail |= verdict == "FAIL" and m == "ahi"
        L.append(f"| {m} | {foot} | {source} | {fmt(effect, m)} | {basis} | {fmt(noise, m)} | **{verdict}** |")

    L += [""]
    if any_fail:
        L += ["**AHI gate FAILED. Do not proceed to device design from these scans.** "
              "Improve markers, capture, or reconstruction, or average more scans per device, "
              "and re-run the study."]
    L += ["", "---", "", "_All values above are computed from the input rows only. "
          "n = 1: these describe the repeatability of this measurement process on one foot, "
          "not population properties._", ""]
    return "\n".join(L)
