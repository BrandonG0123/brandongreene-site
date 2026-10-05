"""Phase 3: picks on a SYNTHETIC block foot, where every measurement is known exactly.

block_foot (tests/synth.py), right foot, in its own coordinates: rounded heel with
its rearmost point at x = 0, body 240 long and 25 tall, inner side y = 90.
Clicked points below are on its surface. Expected values follow from the geometry:

    truncated foot length = 1st MTP x - heel x        = 180
    foot length                                       = 240
    dorsal height at 50 % (x = 120)                   = 25    -> AHI 25 / 180
    navicular height                                  = 18    -> 0.1 of 180
    heel line leans 2 mm inward over 14 mm            -> calcaneal angle atan(2/14) = 8.13 deg
    leg line vertical                                 -> rearfoot angle 8.13 deg
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

import synth
from footscan import landmarks as L
from footscan.recon import viewer_data

pytest.importorskip("manifold3d")

FOOT_LM = {  # foot coordinates (x forward, y = foot's left, z up)
    "mtpj1_medial": [180, 90, 10],
    "mtpj5_lateral": [160, 0, 10],
    "malleolus_medial": [45, 75, 70],
    "malleolus_lateral": [45, 15, 65],
    "navicular_tuberosity": [110, 90, 18],
    "calc_bisect_distal": [0.0, 45, 6],
    "calc_bisect_proximal": [0.0446, 47, 20],  # on the round heel 2 mm round from the back (x ~ 0.04)
    "leg_bisect_distal": [15, 45, 40],
    "leg_bisect_proximal": [15, 45, 120],
}


def placed(yaw, foot="right", mirror=False):
    T = synth.foot_pose(yaw)
    out = {}
    for k, (x, y, z) in FOOT_LM.items():
        if mirror:  # a left foot is the mirror image: inner side at y = 0
            y = 90 - y
        out[k] = (T @ [x, y, z, 1])[:3].round(4).tolist()
    return out


def make_scan(tmp_path, yaw=0.0, foot="right", condition="fwb"):
    folder = tmp_path / f"cap-{foot}-{yaw}"
    (folder / "recon").mkdir(parents=True)
    m = synth.block_foot(yaw, foot)
    m.export(folder / "recon" / "mesh.ply")
    viewer_data.write(m, folder / "recon" / "viewer.bin")
    ident = dict(foot=foot, condition=condition, session="S1", capture_id=folder.name, load_kg=40.0)
    return folder, ident


@pytest.mark.parametrize("yaw", [0.0, 37.0])
def test_measurements_of_the_block_foot(tmp_path, yaw):
    folder, ident = make_scan(tmp_path, yaw)
    rec = L.save_pick(folder, 1, {"landmarks": placed(yaw)}, ident)
    m = rec["measures"]
    assert rec["support_plane"] == L.MAT_PLANE and rec["heel_posterior_auto"] is True
    assert m["truncated_foot_length_mm"] == pytest.approx(180, abs=0.05)
    assert m["foot_length_mm"] == pytest.approx(240, abs=0.05)
    assert m["dorsal_height_50_mm"] == pytest.approx(25, abs=0.01)
    assert m["ahi"] == pytest.approx(25 / 180, abs=1e-3)
    assert m["navicular_height_mm"] == pytest.approx(18, abs=1e-6)
    assert m["navicular_height_norm"] == pytest.approx(0.1, abs=1e-3)
    assert m["calcaneal_angle_deg"] == pytest.approx(math.degrees(math.atan2(2, 14)), abs=0.05)
    assert m["rearfoot_angle_deg"] == pytest.approx(math.degrees(math.atan2(2, 14)), abs=0.05)
    assert m["forefoot_rearfoot_angle_deg"] is None  # standing: not observable


def test_left_foot_gives_the_same_numbers(tmp_path):
    folder, ident = make_scan(tmp_path, 0.0, foot="left")
    m = L.save_pick(folder, 1, {"landmarks": placed(0.0, mirror=True)}, ident)["measures"]
    assert m["navicular_height_mm"] == pytest.approx(18)
    assert m["calcaneal_angle_deg"] == pytest.approx(math.degrees(math.atan2(2, 14)), abs=0.05)


def test_auto_heel_is_the_back_of_the_rounded_heel(tmp_path):
    folder, ident = make_scan(tmp_path, 0.0)
    rec = L.save_pick(folder, 1, {"landmarks": placed(0.0)}, ident)
    x, y, _ = np.asarray(rec["landmarks_used"]["heel_posterior"]) - [100, 150, 0]
    assert x == pytest.approx(0, abs=0.05) and y == pytest.approx(45, abs=2.5)  # 128-gon: within a facet


def test_pick_file_is_a_phase0_scan_record(tmp_path):
    """footscan measure (Phase 0) reads the saved pick as-is and gets the same numbers."""
    from footscan.cli import load_mesh
    from footscan.measures import measure_scan

    folder, ident = make_scan(tmp_path)
    saved = L.save_pick(folder, 2, {"landmarks": placed(0.0)}, ident)
    rec = json.loads((folder / "landmarks" / "pick-2.json").read_text())
    for k in ("foot", "condition", "source", "session", "capture_id", "pick", "load_kg", "landmarks", "support_plane"):
        assert k in rec
    mesh = load_mesh(folder / "landmarks" / rec["mesh"])
    values, _ = measure_scan(dict(rec, landmarks=rec["landmarks_used"]), mesh)
    assert values["ahi"] == pytest.approx(saved["measures"]["ahi"], abs=1e-4)


def test_partial_pick_is_saved_with_a_reason(tmp_path):
    folder, ident = make_scan(tmp_path)
    rec = L.save_pick(folder, 1, {"landmarks": {"navicular_tuberosity": placed(0.0)["navicular_tuberosity"]}}, ident)
    assert all(v is None for v in rec["measures"].values())
    assert any("more landmarks" in w for w in rec["warnings"])
    assert (folder / "landmarks" / "pick-1.json").exists()


def test_bad_input_is_refused(tmp_path):
    folder, ident = make_scan(tmp_path)
    with pytest.raises(L.LandmarkError):
        L.save_pick(folder, 1, {"landmarks": {"elbow": [0, 0, 0]}}, ident)
    with pytest.raises(L.LandmarkError):
        L.save_pick(folder, 1, {"landmarks": {"navicular_tuberosity": [0, 0]}}, ident)
    with pytest.raises(L.LandmarkError):
        L.save_pick(folder, 1, {"landmarks": {"navicular_tuberosity": [5000, 0, 0]}}, ident)


def test_rebuilt_model_marks_picks_stale_and_export_skips_them(tmp_path):
    folder, ident = make_scan(tmp_path)
    L.save_pick(folder, 1, {"landmarks": placed(0.0)}, ident)
    assert L.list_picks(folder)[0]["stale"] is False
    rows = L.export_rows([folder])
    assert {r["measure"] for r in rows} >= {"ahi", "navicular_height_mm"} and rows[0]["load_kg"] == 40.0
    synth.block_foot(1.0).export(folder / "recon" / "mesh.ply")  # "rebuilt"
    assert L.list_picks(folder)[0]["stale"] is True
    assert L.export_rows([folder]) == []


def test_imported_standing_scan_uses_three_floor_clicks(tmp_path):
    folder = tmp_path / "lidar"
    folder.mkdir()
    import trimesh

    floor = trimesh.Trimesh([[0, 0, 0], [400, 0, 0], [400, 400, 0], [0, 400, 0]], [[0, 1, 2], [0, 2, 3]])
    m = trimesh.util.concatenate([synth.block_foot(0.0), floor])  # LiDAR scans include the floor
    m.apply_translation([0, 0, 300])  # an imported mesh: floor not at z = 0
    m.export(folder / "mesh.ply")
    ident = dict(foot="right", condition="fwb", session="S1", capture_id="lidar", load_kg=None)
    assert not L.in_mat_frame(folder)
    assert "floor_a" in [s["key"] for s in L.spec("fwb", in_mat_frame=False)]
    assert "floor_a" not in [s["key"] for s in L.spec("fwb", in_mat_frame=True)]
    lm = {k: [v[0], v[1], v[2] + 300] for k, v in placed(0.0).items()}
    rec = L.save_pick(folder, 1, {"landmarks": lm}, ident)
    assert any("floor" in w for w in rec["warnings"]) and rec["measures"]["navicular_height_mm"] is None
    lm.update(floor_a=[60, 100, 300], floor_b=[300, 120, 300], floor_c=[200, 300, 300])
    rec = L.save_pick(folder, 1, {"landmarks": lm}, ident)
    assert rec["measures"]["navicular_height_mm"] == pytest.approx(18, abs=1e-6)


def test_nwb_asks_for_the_sole_landmarks():
    keys = [s["key"] for s in L.spec("nwb", in_mat_frame=True)]
    assert {"calc_plantar", "mth1_plantar", "mth5_plantar"} <= set(keys)
    assert "calc_plantar" not in [s["key"] for s in L.spec("fwb", in_mat_frame=True)]


def test_synthetic_captures_never_enter_the_export(tmp_path):
    folder, ident = make_scan(tmp_path)
    L.save_pick(folder, 1, {"landmarks": placed(0.0)}, ident)
    (folder / "capture.json").write_text(json.dumps({"synthetic": True}))
    assert L.export_rows([folder]) == []


def test_footscan_measure_reads_a_pick_with_an_automatic_heel(tmp_path):
    from footscan.cli import main

    folder, ident = make_scan(tmp_path)
    L.save_pick(folder, 1, {"landmarks": placed(0.0)}, ident)
    out = tmp_path / "rows.csv"
    assert main(["measure", str(folder / "landmarks" / "pick-1.json"), "-o", str(out)]) == 0
    assert ",navicular_height_mm,18.0," in out.read_text()


def test_floor_clicks_in_either_order_give_the_same_answer(tmp_path):
    import trimesh

    folder = tmp_path / "lidar2"
    folder.mkdir()
    floor = trimesh.Trimesh([[0, 0, 0], [400, 0, 0], [400, 400, 0], [0, 400, 0]], [[0, 1, 2], [0, 2, 3]])
    trimesh.util.concatenate([synth.block_foot(0.0), floor]).export(folder / "mesh.ply")
    ident = dict(foot="right", condition="fwb", session="S1", capture_id="lidar2", load_kg=None)
    lm = placed(0.0)
    results = []
    for order in ([60, 100, 0], [300, 120, 0], [200, 300, 0]), ([200, 300, 0], [300, 120, 0], [60, 100, 0]):
        lm.update(floor_a=order[0], floor_b=order[1], floor_c=order[2])
        rec = L.save_pick(folder, 1, {"landmarks": lm}, ident)
        assert rec["landmarks_used"]["heel_posterior"][2] < 25  # on the heel, not up the leg
        results.append(rec["measures"])
    assert results[0] == results[1]


def test_malformed_input_is_a_clean_error(tmp_path):
    folder, ident = make_scan(tmp_path)
    for bad in ({"landmarks": {"navicular_tuberosity": [1e400, 0, 0]}},
                {"landmarks": {"navicular_tuberosity": [True, 0, 0]}},
                {"landmarks": "x"}):
        with pytest.raises(L.LandmarkError):
            L.save_pick(folder, 1, bad, ident)
    rec = L.save_pick(folder, 1, {"landmarks": placed(0.0), "snapped": ["not", "a", "dict"]}, ident)
    assert rec["snapped"] == {}
    (folder / "landmarks" / "pick-x.json").write_text("{")
    (folder / "landmarks" / "pick-9.json").write_text("{")
    assert [p["pick"] for p in L.list_picks(folder)] == [1]
