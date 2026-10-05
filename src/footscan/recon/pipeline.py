"""Run Phase 2 on one capture folder and write everything to <capture>/recon/.

    footscan reconstruct data/captures/<id> [--calibration-object] [--calipers calipers.json]

Outputs (all in millimetres, mat frame unless noted):

    report.json       every number below, every setting, software versions, warnings
    colmap/           COLMAP's database and sparse model (model units)
    sparse_mm/        the same sparse model moved into the mat frame
    points.ply        the fused dense point cloud
    floor.npy         dense points on the paper (for the accuracy study's table top)
    (the surface step runs in its own process: see in_clean_process)
    mesh_raw.ply      Poisson surface, cut at the floor and trimmed to the data
    mesh.ply          after hole filling, Taubin smoothing and decimation (the result), coloured
    viewer.bin        the same mesh in a compact form for the studio's 3-D viewer
    accuracy.json     calibration-object captures only: scan vs. model
    mesh_foot.ply     foot scans standing on the mat: the mesh in the (provisional) foot frame
    plantar.ply       ... its downward-facing underside (arch), foot frame
    plantar.json      ... frame, footprint size and outline, medial arch profile
    status.json       progress while running (the studio reads it)

Warnings never stop the run; they say which numbers to distrust, in plain
words, and the studio shows them next to the result.
"""

from __future__ import annotations

import hashlib
import json
import platform
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import accuracy, dense, markers, mesh, plantar, scale, sfm, viewer_data

# Thresholds for warnings (not failures).
WARN_REGISTERED_FRACTION = 0.8
WARN_REPROJECTION_PX = 1.0
WARN_SCALE_RESIDUAL_MM = 1.0
WARN_SHEET_DISAGREEMENT_PCT = 0.3


@dataclass
class Settings:
    sfm: sfm.SfmConfig = field(default_factory=sfm.SfmConfig)
    dense: dense.DenseConfig = field(default_factory=dense.DenseConfig)
    mesh: mesh.MeshConfig = field(default_factory=mesh.MeshConfig)


def frame_names(capture_dir: Path) -> tuple[list[str], dict]:
    meta_path = capture_dir / "capture.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    frames = meta.get("frames")
    if frames:
        names = [f["file"] for f in frames if not f.get("excluded") and (capture_dir / f["file"]).exists()]
    else:
        names = sorted(p.name for p in capture_dir.glob("*.jpg"))
    return names, meta


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _versions() -> dict:
    # Read installed versions without importing (importing MeshLab here would
    # load its OpenMP next to COLMAP's; see in_clean_process).
    from importlib.metadata import PackageNotFoundError, version

    def v(name):
        try:
            return version(name)
        except PackageNotFoundError:
            return None

    return dict(python=platform.python_version(), numpy=v("numpy"), scipy=v("scipy"),
                opencv=v("opencv-python-headless") or v("opencv-python"), pycolmap=v("pycolmap"),
                trimesh=v("trimesh"), pymeshlab=v("pymeshlab"), machine=platform.machine())


def write_ply_points(path: Path, P: np.ndarray, C: np.ndarray | None = None) -> None:
    import trimesh

    if C is None:
        colors = None
    else:
        C = np.asarray(C)
        C = np.repeat(C[:, None], 3, 1) if C.ndim == 1 else C
        colors = (np.clip(C, 0, 1) * 255).astype(np.uint8)
    trimesh.PointCloud(P, colors=colors).export(path)


def reconstruct(capture_dir, *, calibration_object: bool = False, calipers: dict | None = None,
                settings: Settings | None = None, log=print) -> dict:
    import pycolmap

    capture_dir = Path(capture_dir)
    settings = settings or Settings()
    out = capture_dir / "recon"
    out.mkdir(exist_ok=True)
    status_path = out / "status.json"
    t_start = time.time()

    def status(stage: str, state: str = "running", **extra):
        status_path.write_text(json.dumps(dict(stage=stage, state=state, at=time.time(),
                                                elapsed_s=round(time.time() - t_start, 1), **extra)))
        log(f"[{stage}]")

    names, meta = frame_names(capture_dir)
    report: dict = dict(
        capture=capture_dir.name,
        synthetic=bool(meta.get("synthetic")),
        not_a_medical_device=True,
        started=time.strftime("%Y-%m-%dT%H:%M:%S"),
        versions=_versions(),
        inputs=dict(photos=len(names), sha256={n: _sha256(capture_dir / n) for n in names}),
        warnings=[],
    )
    warn = report["warnings"].append
    try:
        if len(names) < 10:
            raise RuntimeError(f"only {len(names)} photos; at least 10 are needed (60+ is normal)")
        recorded = meta.get("mat_paper") or (meta.get("summary") or {}).get("mat_paper")
        paper = recorded if recorded in ("letter", "a4") else None
        paper = paper or markers.guess_paper(capture_dir, names)
        if paper is None:
            raise RuntimeError("no scan-mat markers found in the photos; this capture can't be put in millimetres")
        report["paper"] = paper
        board = markers.load_board(paper)

        status("cameras")
        sres = sfm.run(capture_dir, names, out / "colmap", settings.sfm, log=log)
        report["sfm"] = sres.report
        rec = sres.reconstruction
        if sres.report["registered"] < WARN_REGISTERED_FRACTION * len(names):
            warn(f"only {sres.report['registered']} of {len(names)} photos could be placed; parts of the "
                 "subject may be missing or less accurate")
        if sres.report["mean_reprojection_error_px"] > WARN_REPROJECTION_PX:
            warn(f"camera solution is loose (reprojection error {sres.report['mean_reprojection_error_px']} px); "
                 "blurry photos are the usual cause")
        report["warnings"].extend(sres.report.get("warnings", []))

        status("scale")
        registered = sorted(img.name for img in rec.images.values() if img.has_pose)
        dets = markers.detect_images(capture_dir, registered, paper)
        sc = scale.recover(rec, dets, board)
        report["scale"] = sc.report
        if sc.report["residual_rms_mm"] > WARN_SCALE_RESIDUAL_MM:
            warn(f"mat corners fit their printed positions only to {sc.report['residual_rms_mm']} mm RMS; "
                 "the mat may not have been flat, or the print was not at 100%")
        dis = sc.report.get("sheet_scale_disagreement_pct")
        if dis is not None and dis > WARN_SHEET_DISAGREEMENT_PCT:
            warn(f"the two mat sheets disagree on scale by {dis}%; check both sheets were printed at 100%")
        if dis is None:
            warn("only one mat sheet was seen well enough, so the scale has no independent check")
        rec.transform(pycolmap.Sim3d(sc.scale, pycolmap.Rotation3d(sc.R), sc.t))
        (out / "sparse_mm").mkdir(exist_ok=True)
        rec.write(str(out / "sparse_mm"))

        status("depth")
        P, V, C, drep = dense.run(rec, capture_dir, board, settings.dense, log=log)
        report["dense"] = drep
        write_ply_points(out / "points.ply", P, C)

        status("surface")
        np.savez(out / "dense.npz", P=P, V=V, C=C)
        report["mesh"] = in_clean_process(_surface_job, str(out), settings.mesh)

        if calibration_object:
            status("accuracy")
            acc = accuracy.evaluate(_load(out / "mesh.ply"), np.load(out / "floor.npy"), calipers)
            acc["before_smoothing"] = accuracy.evaluate(_load(out / "mesh_raw.ply"), np.load(out / "floor.npy"),
                                                        calipers)["surface_deviation"]
            acc["synthetic"] = report["synthetic"]
            (out / "accuracy.json").write_text(json.dumps(acc, indent=1))
            report["accuracy"] = {k: acc[k] for k in ("surface_deviation", "completeness", "dimensions",
                                                      "registration", "before_smoothing", "warnings")}
            report["warnings"].extend(acc["warnings"])
        (out / "dense.npz").unlink(missing_ok=True)

        foot, condition = meta.get("foot"), meta.get("condition")
        if foot in ("left", "right") and condition in ("swb", "fwb"):
            status("foot frame")
            res = plantar.run(_load(out / "mesh.ply"), foot)
            res["foot_mesh"].export(out / "mesh_foot.ply")
            res["plantar"].export(out / "plantar.ply")
            (out / "plantar.json").write_text(json.dumps(
                dict(**res["summary"], outline_mm=res["outline"].round(2).tolist()), indent=1))
            report["plantar"] = {k: v for k, v in res["summary"].items() if k != "medial_profile"}
            report["warnings"].extend(res["summary"]["notes"])
        elif foot in ("left", "right"):
            report["plantar"] = dict(skipped=f"'{condition}' scans have no floor under the foot; the foot frame "
                                     "comes from landmarks in Phase 3")

        report["seconds"] = round(time.time() - t_start, 1)
        report["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        (out / "report.json").write_text(json.dumps(report, indent=1, default=_json_default))
        status("done", "done", seconds=report["seconds"])
        return report
    except Exception as e:
        report["error"] = str(e)
        report["traceback"] = traceback.format_exc()
        (out / "report.json").write_text(json.dumps(report, indent=1, default=_json_default))
        status("failed", "failed", error=str(e))
        raise


def _load(path: Path):
    import trimesh

    return trimesh.load(path, force="mesh", process=False)


def _surface_job(out_dir: str, cfg) -> dict:
    """Runs in a separate process: points -> mesh files. Returns the mesh report."""
    out = Path(out_dir)
    z = np.load(out / "dense.npz")
    final, stages, floor, rep = mesh.run(z["P"], z["V"], cfg)
    np.save(out / "floor.npy", floor.astype(np.float32))
    stages["trimmed"].export(out / "mesh_raw.ply")
    if "C" in z.files:
        mesh.color_vertices(final, z["P"], z["C"])
    final.export(out / "mesh.ply")
    viewer_data.write(final, out / "viewer.bin")
    return rep


def in_clean_process(fn, *args):
    """Run fn in a fresh Python process and return its result.

    COLMAP and MeshLab each ship their own copy of the OpenMP threading
    library; loading both into one process makes OpenMP abort. A fresh
    ("spawned", not forked) process that never imports COLMAP keeps them
    apart.
    """
    import multiprocessing as mp
    from concurrent.futures import ProcessPoolExecutor

    with ProcessPoolExecutor(max_workers=1, mp_context=mp.get_context("spawn")) as ex:
        return ex.submit(fn, *args).result()


def _json_default(o):
    if isinstance(o, np.generic):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, tuple):
        return list(o)
    raise TypeError(type(o).__name__)
