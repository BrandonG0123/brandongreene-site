"""Statistics tests on simulated data with known variance components.

Simulated rows exist only inside these tests to check the estimators
recover what was put in. They are not measurements.
"""

import csv
import math

import numpy as np
import pytest
from scipy import stats

from footscan.cli import main
from footscan.repeatability import (
    arch_height_flexibility,
    condition_differences,
    gate,
    read_rows,
    sd_ci,
    summarize,
)


def simulate(rng, condition, mean, sd_session, sd_capture, sd_pick, n_sessions, n_caps, n_picks,
             measure="ahi", load=None):
    rows = []
    for s in range(n_sessions):
        s_eff = rng.normal(0, sd_session)
        for c in range(n_caps):
            c_eff = rng.normal(0, sd_capture)
            for p in range(n_picks):
                rows.append(dict(foot="right", source="scan", condition=condition, session=f"S{s}",
                                 capture_id=f"{condition}-S{s}-C{c}", pick=p + 1, load_kg=load,
                                 measure=measure, value=mean + s_eff + c_eff + rng.normal(0, sd_pick)))
    return rows


def test_sd_ci_matches_chi_square():
    lo, hi = sd_ci(1.0, 10)
    assert lo == pytest.approx(math.sqrt(9 / stats.chi2.ppf(0.975, 9)))
    assert hi == pytest.approx(math.sqrt(9 / stats.chi2.ppf(0.025, 9)))
    assert lo < 1.0 < hi


def test_variance_decomposition_recovers_components():
    rng = np.random.default_rng(0)
    rows = simulate(rng, "fwb", 0.3, sd_session=0.004, sd_capture=0.006, sd_pick=0.003,
                    n_sessions=200, n_caps=6, n_picks=4)
    (s,) = summarize(rows)
    assert s.pick_sd == pytest.approx(0.003, rel=0.05)
    assert s.capture_sd == pytest.approx(0.006, rel=0.07)
    assert s.session_sd == pytest.approx(0.004, rel=0.15)
    assert s.mdc95 == pytest.approx(1.96 * math.sqrt(2) * s.sd)


def test_small_n_warns():
    rng = np.random.default_rng(1)
    (s,) = summarize(simulate(rng, "nwb", 0.3, 0, 0.01, 0, 1, 3, 1))
    assert any("unreliable" in w for w in s.warnings)


def test_differences_and_ahf():
    rng = np.random.default_rng(2)
    rows = simulate(rng, "swb", 70.0, 0, 0.5, 0, 1, 400, 1, measure="dorsal_height_50_mm", load=10.0)
    rows += simulate(rng, "fwb", 64.0, 0, 0.5, 0, 1, 400, 1, measure="dorsal_height_50_mm", load=40.0)
    summaries = summarize(rows)
    (d,) = condition_differences(summaries)
    assert (d.cond_a, d.cond_b) == ("swb", "fwb")
    assert d.diff == pytest.approx(6.0, abs=0.15)
    assert d.mdc95_single == pytest.approx(1.96 * math.sqrt(2) * 0.5, rel=0.1)
    (a,) = arch_height_flexibility(summaries)
    assert a["ahf"] == pytest.approx(6.0 / (30 * 9.80665 / 1000), rel=0.03)


@pytest.mark.parametrize("effect,noise,verdict", [
    (0.02, 0.009, "PASS"), (0.02, 0.01, "MARGINAL"), (-0.02, 0.019, "MARGINAL"),
    (0.02, 0.02, "FAIL"), (0.02, float("nan"), "INSUFFICIENT DATA"),
])
def test_gate(effect, noise, verdict):
    assert gate(effect, noise) == verdict


def test_cli_end_to_end(tmp_path):
    rng = np.random.default_rng(3)
    rows = simulate(rng, "nwb", 0.33, 0.002, 0.004, 0.002, 2, 5, 2)
    rows += simulate(rng, "fwb", 0.30, 0.002, 0.004, 0.002, 2, 5, 2)
    path = tmp_path / "trials.csv"
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({**r, "load_kg": "" if r["load_kg"] is None else r["load_kg"]})
    assert len(read_rows([path])) == len(rows)
    out = tmp_path / "report.md"
    assert main(["repeatability", str(path), "-o", str(out)]) == 0
    text = out.read_text()
    assert "Not a medical device" in text
    assert "| ahi | right | scan |" in text
