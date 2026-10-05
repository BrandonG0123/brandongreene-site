"""Phase 2 reconstruction: unit tests with exact answers.

Every scene here is SYNTHETIC (built in the test), so the right answer is
known exactly. These tests check the code; they say nothing about real-world
accuracy, which comes only from scanning the printed calibration object.
"""

from __future__ import annotations

import importlib.util

import numpy as np
import pytest

if importlib.util.find_spec("pycolmap") is None:  # not imported here: see pipeline.in_clean_process
    pytest.skip("pycolmap not installed", allow_module_level=True)
pytest.importorskip("pymeshlab")

from footscan.recon import accuracy, calib, dense, mesh, scale  # noqa: E402
from footscan.recon.geometry import SurfaceIndex  # noqa: E402


def rot(axis, deg):
    import cv2

    a = np.asarray(axis, float)
    return cv2.Rodrigues((a / np.linalg.norm(a) * np.radians(deg)).reshape(3, 1))[0]


# --------------------------------------------------------------------------
# calibration object
# --------------------------------------------------------------------------
def test_calibration_object_is_closed_and_the_right_size():
    m = calib.build()
    assert m.is_watertight
    assert np.allclose(m.bounds, [[0, 0, 0], [calib.LENGTH, calib.WIDTH, calib.TERRACE_HIGH]], atol=1e-6)


def test_calibration_object_matches_its_formula():
    """The mesh and the analytic height function describe the same shape."""
    m = calib.build()
    rng = np.random.default_rng(0)
    xy = rng.uniform([1, 1], [calib.LENGTH - 1, calib.WIDTH - 1], (3000, 2))
    # stay clear of the vertical steps, where "height" jumps
    x0, x1 = calib.RAMP_X
    away = (np.abs(xy[:, 0] - x1) > 0.5) & (np.abs(xy[:, 1] - calib.TERRACE_SPLIT_Y) > 0.5)
    r = np.hypot(xy[:, 0] - calib.DOME_CENTER[0], xy[:, 1] - calib.DOME_CENTER[1])
    away &= np.abs(r - calib.DOME_RADIUS) > 0.5
    xy = xy[away]
    pts = np.c_[xy, calib.height(xy[:, 0], xy[:, 1])]
    d = SurfaceIndex(m).closest(pts)[1]
    assert d.max() < 0.01


def test_dome_is_a_true_sphere_to_microns():
    m = calib.build()
    rng = np.random.default_rng(1)
    v = rng.normal(size=(2000, 3))
    v[:, 2] = np.abs(v[:, 2]) + 0.05
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    p = np.array([*calib.DOME_CENTER, calib.BASE]) + calib.DOME_RADIUS * v
    assert SurfaceIndex(m).closest(p)[1].max() < 0.01


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------
def test_surface_index_is_exact():
    import trimesh

    m = calib.build()
    rng = np.random.default_rng(3)
    pts = np.vstack([trimesh.sample.sample_surface(m, 3000, seed=rng)[0] + rng.normal(0, 0.3, (3000, 3)),
                     rng.uniform([-5, -5, -5], [155, 75, 40], (1000, 3))])
    _, d0, _ = trimesh.proximity.closest_point(m, pts)
    _, d1, s1 = SurfaceIndex(m).closest(pts)
    assert np.abs(d0 - d1).max() < 1e-6
    assert np.mean((s1 < 0) == m.contains(pts)) > 0.995


def test_umeyama_recovers_a_similarity_even_for_flat_points():
    rng = np.random.default_rng(0)
    X = np.c_[rng.uniform(-100, 100, (40, 2)), np.zeros(40)]  # coplanar, like a mat
    R = rot([1, 2, 3], 40)
    Y = 3.7 * X @ R.T + [5, -2, 9]
    s, Rh, t = scale.umeyama(X, Y)
    assert s == pytest.approx(3.7, rel=1e-9)
    assert np.allclose(Rh, R, atol=1e-9) and np.allclose(t, [5, -2, 9], atol=1e-7)


def test_umeyama_never_returns_a_mirror_image():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(30, 3))
    Y = X * [1, 1, -1]  # a reflection: not achievable by rotation
    _, R, _ = scale.umeyama(X, Y)
    assert np.linalg.det(R) == pytest.approx(1.0)


def test_triangulation_is_exact_without_noise_and_refines_with_noise():
    rng = np.random.default_rng(2)
    X = np.array([10.0, -5.0, 400.0])
    Rs, ts, obs = [], [], []
    for i in range(6):
        R = rot([0, 1, 0], -20 + 8 * i)
        t = np.array([-60.0 + 25 * i, 3.0, 20.0])
        c = R @ X + t
        Rs.append(R), ts.append(t), obs.append(c[:2] / c[2])
    Rs, ts, obs = np.array(Rs), np.array(ts), np.array(obs)
    assert np.allclose(scale.triangulate(obs, Rs, ts), X, atol=1e-6)
    noisy = obs + rng.normal(0, 0.3 / 1000, obs.shape)  # 0.3 px at f = 1000
    Xr = scale.refine_point(scale.triangulate(noisy, Rs, ts), noisy, Rs, ts)
    assert np.linalg.norm(Xr - X) < 1.0


def test_mat_frame_uses_both_sheets_for_the_floor_and_one_for_position():
    """A crooked tape seam must not tilt the floor or move the origin."""
    rng = np.random.default_rng(4)
    heel = np.c_[rng.uniform(0, 215, (40, 2)), np.zeros(40)]
    toe = np.c_[rng.uniform(0, 215, (40, 2)), np.zeros(40)]
    seam = rot([0, 0, 1], 0.8)
    toe_on_floor = toe @ seam.T + [1.5, 279.4 - 0.7, 0]  # shifted and twisted, but on the floor
    s_true, R_true, t_true = 0.02, rot([1, -1, 0.5], 70), np.array([3.0, 1.0, -2.0])
    to_model = lambda P: (P - t_true) @ R_true / s_true  # inverse of mat = s R model + t
    Xh, Xt = to_model(heel), to_model(toe_on_floor)
    cams = to_model(np.array([[100.0, 280.0, 400.0], [50.0, 200.0, 350.0]]))
    R, t = scale._frame(s_true, np.vstack([Xh, Xt]), Xh, heel, cams)
    back = s_true * np.vstack([Xh, Xt]) @ R.T + t
    assert np.abs(back[:, 2]).max() < 1e-6                          # floor is z = 0 everywhere
    assert np.allclose(back[:40], heel, atol=1e-6)                   # heel sheet exactly in place
    assert np.allclose(back[40:], toe_on_floor, atol=1e-6)           # toe sheet where it really is


# --------------------------------------------------------------------------
# dense + mesh pieces
# --------------------------------------------------------------------------
def test_edge_band_removes_pixels_next_to_a_depth_jump_only():
    d = np.full((40, 40), 400.0, np.float32)
    d[:, 20:] = 300.0  # a 100 mm step at column 20
    band = dense.edge_band(d, 0.015, 3)
    assert band[:, 16:24].all()
    assert not band[:, :15].any() and not band[:, 25:].any()


def test_voxel_merge_averages_points_in_the_same_cube():
    P = np.array([[0.1, 0.1, 0.1], [0.3, 0.3, 0.3], [5.0, 5.0, 5.0]])
    N = np.array([[0, 0, 1.0], [0, 0, 1.0], [1.0, 0, 0]])
    Pm, Nm, Cm = dense.voxel_merge(P, N, np.array([0.2, 0.4, 1.0]), 1.0)
    assert len(Pm) == 2
    assert np.allclose(sorted(Pm[:, 0]), [0.2, 5.0])
    assert np.allclose(sorted(Cm), [0.3, 1.0])


def test_outlier_and_debris_removal():
    rng = np.random.default_rng(5)
    v = rng.normal(size=(20000, 3))
    P = 30 * v / np.linalg.norm(v, axis=1, keepdims=True)
    stray = np.array([[0.0, 0.0, 0.0], [60.0, 0.0, 0.0]])
    debris = rng.normal([100, 100, 100], 0.3, (50, 3))
    allp = np.vstack([P, stray, debris])
    ok = mesh.remove_outliers(allp, 16, 2.5)
    assert not ok[20000:20002].any()
    assert ok[:20000].mean() > 0.97
    keep = mesh.main_pieces(allp[ok], 1.5, 0.02)
    assert not keep[-50:].any() and keep[:-50].mean() > 0.99


def test_poisson_surface_of_a_sphere_has_the_right_radius():
    rng = np.random.default_rng(6)
    v = rng.normal(size=(30000, 3))
    n = v / np.linalg.norm(v, axis=1, keepdims=True)
    P = 25 * n + [0, 0, 40]
    m = mesh.poisson(P, n, mesh.MeshConfig(poisson_depth=8))
    r = np.linalg.norm(m.vertices - [0, 0, 40], axis=1)
    assert np.median(np.abs(r - 25)) < 0.1


# --------------------------------------------------------------------------
# accuracy study
# --------------------------------------------------------------------------
def _placed_copy(scale_factor=1.0):
    ref = calib.build()
    m = ref.copy()
    m.update_faces(m.face_normals[:, 2] > -0.9)  # the camera never sees the bottom
    m.apply_scale(scale_factor)
    T = np.eye(4)
    T[:3, :3] = rot([0, 0, 1], 97)
    T[:3, 3] = [150.0, 230.0, 0.0]
    m.apply_transform(T)
    return m


def test_accuracy_of_a_perfect_scan_is_zero():
    a = accuracy.evaluate(_placed_copy())
    assert a["surface_deviation"]["median_mm"] < 0.005
    assert a["completeness"]["within_1mm"] > 0.999
    dims = {r["key"]: r for r in a["dimensions"]}
    for k in ("length", "width", "terrace_high", "terrace_low", "dome_apex"):
        assert abs(dims[k]["scan_minus_reference_mm"]) < 0.05, k


def test_alignment_never_hides_a_scale_error():
    """A scan 1% too big must show up as 1% too big, not be lined up away."""
    a = accuracy.evaluate(_placed_copy(1.01))
    dims = {r["key"]: r for r in a["dimensions"]}
    assert dims["length"]["scan_minus_reference_mm"] == pytest.approx(1.5, abs=0.1)
    assert dims["terrace_high"]["scan_minus_reference_mm"] == pytest.approx(0.35, abs=0.05)
    assert a["surface_deviation"]["median_mm"] > 0.1


def test_caliper_values_become_the_reference_and_print_errors_are_flagged():
    a = accuracy.evaluate(_placed_copy(), calipers={"length": 149.2, "width": 70.05})
    dims = {r["key"]: r for r in a["dimensions"]}
    assert dims["length"]["reference"] == "calipers"
    assert dims["length"]["scan_minus_reference_mm"] == pytest.approx(0.8, abs=0.05)
    assert any("Overall length" in w for w in a["warnings"])          # 0.8 mm off the model
    assert not any("Overall width" in w for w in a["warnings"])       # 0.05 mm: within print tolerance


# --------------------------------------------------------------------------
# plantar surface + provisional foot frame
# --------------------------------------------------------------------------
def _block_foot(yaw_deg: float, foot: str = "right"):
    import synth

    return synth.block_foot(yaw_deg, foot)


def test_provisional_frame_points_forward_and_measures_the_footprint():
    from footscan.recon import plantar

    m = _block_foot(yaw_deg=93.0)  # foot's +x turned to roughly mat +y (toes toward sheet 2)
    out = plantar.run(m, "right")
    s = out["summary"]
    fwd = np.array(s["frame"]["anterior"])
    assert fwd @ [np.cos(np.radians(93)), np.sin(np.radians(93)), 0] > 0.999
    assert s["footprint_length_mm"] == pytest.approx(240.0, abs=0.5)
    assert s["footprint_width_mm"] == pytest.approx(90.0, abs=0.5)
    assert s["provisional"] and s["toe_end_from"] == "leg"
    # medial axis points to the tunnel side for a right foot
    assert np.allclose(np.array(s["frame"]["medial"]), np.cross([0, 0, 1], fwd), atol=1e-9)


def test_leg_overrules_the_mat_when_the_foot_faces_backwards():
    from footscan.recon import plantar

    s = plantar.run(_block_foot(yaw_deg=-87.0), "right")["summary"]
    assert np.array(s["frame"]["anterior"]) @ [np.cos(np.radians(-87)), np.sin(np.radians(-87)), 0] > 0.999
    assert any("leg" in n for n in s["notes"])


@pytest.mark.parametrize("foot", ["right", "left"])
def test_medial_arch_profile_finds_the_arch(foot):
    from footscan.recon import plantar

    s = plantar.run(_block_foot(yaw_deg=90.0, foot=foot), foot)["summary"]
    prof = {round(r["x_mm"]): r["height_mm"] for r in s["medial_profile"]}
    assert prof[110] == pytest.approx(12.0, abs=0.01)   # under the arch
    assert prof[30] == pytest.approx(0.0, abs=0.01)     # heel on the floor
    assert prof[200] == pytest.approx(0.0, abs=0.01)    # forefoot on the floor


def test_foot_frame_mesh_keeps_faces_pointing_outward_for_both_feet():
    from footscan.recon import plantar

    for foot in ("right", "left"):
        out = plantar.run(_block_foot(yaw_deg=90.0, foot=foot), foot)
        fm = out["foot_mesh"]
        top = np.abs(fm.triangles_center[:, 2] - 25.0) < 0.01  # the block's top (not the leg)
        assert (fm.face_normals[top, 2] > 0.99).mean() > 0.9, foot
        assert len(out["plantar"].faces) > 0
