"""End-to-end Phase 2 on a SYNTHETIC capture (rendered photos). Slow: run with

    .venv/bin/python -m pytest -m slow

The scene is rendered, so the truth is exact. Passing means the pipeline's
pieces fit together and recover a known shape and size; it does not measure
how accurate a real phone is (that needs the printed calibration object).
Thresholds are loose versions of what the code achieved when written,
so a regression trips them without random failures.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import synth  # noqa: E402

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def run(tmp_path_factory):
    from footscan.recon import pipeline

    d = tmp_path_factory.mktemp("synthetic_capture")
    truth = synth.make_capture(d, seed=0)
    report = pipeline.reconstruct(d, calibration_object=True, log=lambda *a: None)
    return d, truth, report


def test_every_photo_placed_and_scale_checks_agree(run):
    _, truth, r = run
    assert r["synthetic"] is True
    assert r["sfm"]["registered"] == len(truth["cameras"])
    assert r["sfm"]["mean_reprojection_error_px"] < 0.6
    assert r["scale"]["sheet_scale_disagreement_pct"] < 0.2


def test_scale_matches_the_truth(run):
    d, truth, _ = run
    import pycolmap

    rec = pycolmap.Reconstruction(str(d / "recon" / "sparse_mm"))
    err = []
    for img in rec.images.values():
        c_true = -np.array(truth["cameras"][img.name]["R"]).T @ np.array(truth["cameras"][img.name]["t"])
        err.append(np.linalg.norm(img.projection_center() - c_true))
    assert np.median(err) < 1.0  # mm, cameras ~380 mm away


def test_calibration_object_recovered(run):
    d, _, r = run
    acc = json.loads((d / "recon" / "accuracy.json").read_text())
    assert acc["synthetic"] is True
    assert acc["surface_deviation"]["median_mm"] < 0.3
    assert acc["surface_deviation"]["p95_mm"] < 1.5
    assert acc["completeness"]["within_2mm"] > 0.97
    for row in acc["dimensions"]:
        assert abs(row["scan_minus_reference_mm"]) < 0.6, row


def test_outputs_written(run):
    d, _, _ = run
    for name in ("report.json", "mesh.ply", "mesh_raw.ply", "points.ply", "accuracy.json", "status.json", "viewer.bin"):
        assert (d / "recon" / name).exists(), name
    from footscan.recon import viewer_data

    v = viewer_data.read(d / "recon" / "viewer.bin")
    assert v["colors"] is not None and len(v["colors"]) == len(v["vertices"])
    # the rendered object is light grey with dark speckle: colours must vary, not be one flat value
    assert v["colors"].std() > 10
    assert json.loads((d / "recon" / "status.json").read_text())["state"] == "done"


def test_colmap_is_reproducible(run, tmp_path):
    """Same photos, same settings -> bit-identical camera poses (fixed seed, one thread)."""
    from footscan.recon import pipeline, sfm

    d, _, _ = run
    names, _ = pipeline.frame_names(d)
    a = sfm.poses(sfm.run(d, names, tmp_path / "a", log=lambda *x: None).reconstruction)
    b = sfm.poses(sfm.run(d, names, tmp_path / "b", log=lambda *x: None).reconstruction)
    assert a.keys() == b.keys()
    for n in a:
        assert np.array_equal(a[n][0], b[n][0]) and np.array_equal(a[n][1], b[n][1])
