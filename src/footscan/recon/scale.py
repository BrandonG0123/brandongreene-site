"""From COLMAP's unitless model to millimetres on the mat.

COLMAP's model is right in shape but arbitrary in size, position and
orientation (any similarity transform of it explains the photos equally
well). The mat pins all three down: we know where every marker corner is
printed, to the hundredth of a millimetre. So:

1. **Find the corners in every photo** (markers.py) and throw out the ones
   that disagree with their sheet. A sheet is flat, so in one photo its
   corners must all be related to the printed positions by a single
   *homography* (the 3x3 projective map between a plane and its image).
   Fit one per sheet per photo with RANSAC and drop corners that miss it by
   more than ``HOMOGRAPHY_TOL_PX``: those are corners partly hidden by the
   foot, crossed by a shadow edge, or seen at a grazing angle.

2. **Triangulate each corner in 3-D.** Each photo where a corner was seen
   gives a ray from that camera through that pixel. With COLMAP's camera
   poses, the rays from several photos (nearly) meet; the meeting point is
   the corner in model units. Solved first linearly (the "DLT": each ray
   gives two linear equations in the unknown point), then refined to
   minimise the pixel error directly, dropping any observation that is still
   off by more than ``TRIANGULATION_TOL_PX``.

3. **Fit a similarity transform per sheet.** We now have pairs (corner in
   model units, the same corner in printed millimetres). The scale s,
   rotation R and translation t that best map one set onto the other, in the
   least-squares sense, have a closed-form solution (Umeyama 1991): centre
   both point sets, take the SVD of their cross-covariance; R comes from the
   singular vectors, s from the singular values divided by the spread of
   the model points, t lines up the centroids.

4. **Report the error honestly.** After the fit, every corner has a
   residual: how far (mm) its triangulated position lands from where it is
   printed. Their RMS is the *residual error* of the scale recovery. Three
   further checks come for free:
   - the two sheets are fitted independently; their scales should agree,
     and the disagreement (as % and as mm over a 250 mm foot) is an honest
     estimate of scale error that never entered either fit;
   - resampling the markers (bootstrap) shows how much the scale would
     change with a different subset of markers: its standard error;
   - residuals perpendicular to the paper show how flat the mat lay.

The final frame is the mat frame (mm): x across, y toward the toes, z up out
of the paper, origin at the heel sheet's bottom-left corner. Scale is the
corner-weighted mean of the two sheets; rotation and translation come from
the heel sheet (the toe sheet's actual position, which tape can shift by a
millimetre or two, is reported as the "seam offset").
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .markers import Detection, to_colmap

HOMOGRAPHY_TOL_PX = 1.5
TRIANGULATION_TOL_PX = 2.0
MIN_TRIANGULATION_DEG = 3.0          # rays this nearly parallel fix the corner's depth poorly
SHEET_OUTLIER_SIGMA = 3.0            # corners this far outside the rest of their sheet's fit are dropped
MIN_MARKERS_PER_SHEET_IN_PHOTO = 3   # fewer and the sheet's homography can't vouch for its corners
MIN_VIEWS = 3                        # a corner must be seen (and kept) in at least this many photos
MIN_CORNERS_PER_SHEET = 12           # three markers' worth before a sheet's scale is trusted
FOOT_LENGTH_MM = 250.0               # for expressing a scale error as millimetres over a foot
BOOTSTRAP = 300


class ScaleError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# geometry helpers
# --------------------------------------------------------------------------
def umeyama(X: np.ndarray, Y: np.ndarray, with_scale: bool = True) -> tuple[float, np.ndarray, np.ndarray]:
    """s, R, t minimising sum |s R X_i + t - Y_i|^2 (closed form, Umeyama 1991)."""
    X, Y = np.asarray(X, float), np.asarray(Y, float)
    mx, my = X.mean(0), Y.mean(0)
    Xc, Yc = X - mx, Y - my
    cov = Yc.T @ Xc / len(X)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:  # never return a mirror image
        S[2, 2] = -1
    R = U @ S @ Vt
    var_x = (Xc**2).sum() / len(X)
    s = float(np.trace(np.diag(D) @ S) / var_x) if with_scale else 1.0
    t = my - s * R @ mx
    return s, R, t


def triangulate(obs_norm: np.ndarray, Rs: np.ndarray, ts: np.ndarray) -> np.ndarray:
    """Least-squares meeting point of several rays (linear DLT).

    obs_norm: (n, 2) undistorted normalised image coords (x/z, y/z) of the
    same point in n cameras with world->camera poses Rs (n, 3, 3), ts (n, 3).
    """
    rows = []
    for (x, y), R, t in zip(obs_norm, Rs, ts):
        P = np.c_[R, t]
        rows.append(x * P[2] - P[0])
        rows.append(y * P[2] - P[1])
    _, _, Vt = np.linalg.svd(np.asarray(rows))
    Xh = Vt[-1]
    return Xh[:3] / Xh[3]


def reproject_norm(X: np.ndarray, Rs: np.ndarray, ts: np.ndarray) -> np.ndarray:
    c = np.einsum("nij,j->ni", Rs, X) + ts
    return c[:, :2] / c[:, 2:3]


def refine_point(X: np.ndarray, obs_norm: np.ndarray, Rs: np.ndarray, ts: np.ndarray, iters: int = 10) -> np.ndarray:
    """Gauss-Newton: move X to minimise the squared reprojection error.

    The DLT minimises an algebraic quantity, not the distance in the image;
    a few Newton steps on the real error fix that.
    """
    for _ in range(iters):
        c = np.einsum("nij,j->ni", Rs, X) + ts
        z = c[:, 2:3]
        r = (c[:, :2] / z - obs_norm).ravel()
        # d(c_xy / c_z)/dX = (R_xy - (c_xy / c_z) R_z) / c_z
        J = ((Rs[:, :2, :] - (c[:, :2] / z)[:, :, None] * Rs[:, 2:3, :]) / z[:, :, None]).reshape(-1, 3)
        step, *_ = np.linalg.lstsq(J, -r, rcond=None)
        X = X + step
        if np.linalg.norm(step) < 1e-12 * (1 + np.linalg.norm(X)):
            break
    return X


# --------------------------------------------------------------------------
# the scale recovery
# --------------------------------------------------------------------------
@dataclass
class ScaleResult:
    scale: float                 # mm per model unit
    R: np.ndarray                # model -> mat rotation
    t: np.ndarray                # model -> mat translation (mm)
    corners_model: dict          # (marker_id, k) -> xyz in model units
    report: dict

    @property
    def matrix(self) -> np.ndarray:
        """3x4 [sR | t]: mat_mm = sR @ model + t."""
        return np.c_[self.scale * self.R, self.t]

    def apply(self, X: np.ndarray) -> np.ndarray:
        return (self.scale * np.asarray(X, float) @ self.R.T) + self.t


def _filter_by_sheet_homography(dets: list[Detection], norm: dict, focal: float) -> tuple[list, int]:
    """Keep corners consistent with one homography per sheet in this photo."""
    import cv2

    kept, dropped = [], 0
    for sheet in {d.sheet for d in dets}:
        group = [d for d in dets if d.sheet == sheet]
        if len(group) < MIN_MARKERS_PER_SHEET_IN_PHOTO:
            dropped += 4 * len(group)
            continue
        src = np.vstack([d.corners_mm for d in group])
        dst = np.vstack([norm[(d.marker_id)] for d in group])
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, HOMOGRAPHY_TOL_PX / focal, maxIters=2000, confidence=0.999)
        if H is None:
            dropped += 4 * len(group)
            continue
        mask = mask.ravel().astype(bool).reshape(len(group), 4)
        for d, m in zip(group, mask):
            kept.extend((d, k) for k in range(4) if m[k])
            dropped += int((~m).sum())
    return kept, dropped


def recover(rec, detections: dict[str, list[Detection]], board: dict) -> ScaleResult:
    """Scale, rotation and translation from model units to the mat (mm), with error report."""
    from .sfm import poses as get_poses

    poses = get_poses(rec)
    cameras = {img.name: img.camera for img in rec.images.values() if img.has_pose}
    obs: dict[tuple[int, int], list] = {}
    n_dropped_h = n_seen = 0
    for name, dets in detections.items():
        if name not in poses or not dets:
            continue
        cam = cameras[name]
        norm = {d.marker_id: cam.cam_from_img(to_colmap(d.corners_px)) for d in dets}
        kept, dropped = _filter_by_sheet_homography(dets, norm, float(cam.mean_focal_length()))
        n_dropped_h += dropped
        n_seen += 4 * len(dets)
        for d, k in kept:
            obs.setdefault((d.marker_id, k), []).append((name, norm[d.marker_id][k], d.sheet, d.corners_mm[k]))

    focal = float(next(iter(cameras.values())).mean_focal_length()) if cameras else 1.0
    corners_model, printed, sheet_of = {}, {}, {}
    n_dropped_tri = n_weak = 0
    for key, views in obs.items():
        views = list(views)
        while len(views) >= MIN_VIEWS:
            Rs = np.array([poses[v[0]][0] for v in views])
            ts = np.array([poses[v[0]][1] for v in views])
            xy = np.array([v[1] for v in views])
            X = refine_point(triangulate(xy, Rs, ts), xy, Rs, ts)
            err_px = np.linalg.norm(reproject_norm(X, Rs, ts) - xy, axis=1) * focal
            worst = int(np.argmax(err_px))
            if err_px[worst] <= TRIANGULATION_TOL_PX:
                # A point behind a camera reprojects to the same pixel, and rays
                # from photos taken from almost the same place pin depth down
                # poorly: both pass the pixel test, so check them separately.
                depth = (np.einsum("nij,j->ni", Rs, X) + ts)[:, 2]
                centres = -np.einsum("nji,nj->ni", Rs, ts)
                rays = X - centres
                rays /= np.linalg.norm(rays, axis=1, keepdims=True)
                widest = np.degrees(np.arccos(np.clip((rays @ rays.T).min(), -1, 1)))
                if np.all(depth > 0) and widest >= MIN_TRIANGULATION_DEG:
                    corners_model[key] = X
                    printed[key] = np.r_[views[0][3], 0.0]
                    sheet_of[key] = views[0][2]
                else:
                    n_weak += 1
                break
            views.pop(worst)
            n_dropped_tri += 1

    per_sheet = {}
    for sheet in sorted(set(sheet_of.values())):
        keys = [k for k in corners_model if sheet_of[k] == sheet]
        if len(keys) < MIN_CORNERS_PER_SHEET:
            continue
        X = np.array([corners_model[k] for k in keys])
        Y = np.array([printed[k] for k in keys])
        per_sheet[sheet] = _fit_sheet(X, Y, keys)
    if not per_sheet:
        raise ScaleError("not enough mat corners could be located in 3-D to set the scale. The mat must be "
                         "visible (and not too far away) in most photos.")

    # Combined scale: corner-weighted mean of the sheets' scales.
    n = {k: v["n_corners"] for k, v in per_sheet.items()}
    scale = sum(per_sheet[k]["scale"] * n[k] for k in per_sheet) / sum(n.values())
    ref = 0 if 0 in per_sheet else min(per_sheet)
    keys = per_sheet[ref]["keys"]
    X = np.array([corners_model[k] for k in keys])
    Y = np.array([printed[k] for k in keys])
    if ref == 1:  # toe sheet only: place it at its nominal spot on the mat
        Y = Y + [*board["sheets"][1]["origin_mm"], 0.0]
    kept = [k for v in per_sheet.values() for k in v["keys"]]  # outliers left out of the floor plane too
    R, t = _frame(scale, np.array([corners_model[k] for k in kept]), X, Y,
                  cameras=np.array([-R_.T @ t_ for R_, t_ in poses.values()]))
    result = ScaleResult(scale, R, t, corners_model, {})

    residual = np.linalg.norm(result.apply(X) - Y, axis=1)
    report = dict(
        corners_seen=n_seen,
        corner_sightings_dropped=n_dropped_h,  # inconsistent with their sheet in that photo, or too few markers seen
        observations_dropped_triangulation=n_dropped_tri,
        corners_poorly_triangulated=n_weak,
        corners_located=len(corners_model),
        reference_sheet=["heel", "toe"][ref],
        mm_per_model_unit=scale,
        residual_rms_mm=_rms(residual),
        # Height of every located corner above the fitted floor plane: how flat the mat lay.
        mat_flatness_rms_mm=_rms(result.apply(np.array(list(corners_model.values())))[:, 2]),
        sheets={["heel", "toe"][k]: {kk: vv for kk, vv in v.items() if kk != "keys"} for k, v in per_sheet.items()},
    )
    if len(per_sheet) == 2:
        s0, s1 = per_sheet[0]["scale"], per_sheet[1]["scale"]
        rel = abs(s0 - s1) / scale
        report["sheet_scale_disagreement_pct"] = round(100 * rel, 4)
        report["sheet_scale_disagreement_mm_per_250mm"] = round(rel * FOOT_LENGTH_MM, 3)
        # Where the toe sheet really is, relative to where it nominally sits.
        tk = per_sheet[1]["keys"]
        actual = result.apply(np.array([corners_model[k] for k in tk]))
        nominal = np.array([printed[k] for k in tk]) + [*board["sheets"][1]["origin_mm"], 0.0]
        _, Rs, ts = umeyama(nominal, actual, with_scale=False)
        report["seam_offset"] = dict(
            shift_mm=[round(float(v), 2) for v in (Rs @ nominal.mean(0) + ts - nominal.mean(0))[:2]],
            rotation_deg=round(float(np.degrees(np.arctan2(Rs[1, 0], Rs[0, 0]))), 3),
        )
    else:
        report["sheet_scale_disagreement_pct"] = None
        report["note"] = "only one sheet was seen well enough; no independent scale check is possible"
    result.report = report
    return result


def _frame(scale: float, all_corners: np.ndarray, X_ref: np.ndarray, Y_ref: np.ndarray, cameras: np.ndarray):
    """Rotation and translation into the mat frame, with the scale fixed.

    Two steps, because the two sheets agree on some things and not others:

    - **Which way is up, and where z = 0 is**: both sheets lie on the same
      floor, so fit one plane through *every* located corner (least squares:
      the direction of least spread is the normal). Using only one sheet would
      leave the plane's tilt resting on a short baseline; a tenth of a degree
      of tilt is half a millimetre of height at the other end of the mat.
      The normal points to the side the cameras are on.
    - **Where x and y are**: the tape seam can shift or twist one sheet
      relative to the other in the floor plane, so the in-plane position comes
      from the reference sheet alone (a 2-D rotation + shift, Procrustes).
    """
    S = scale * all_corners
    c = S.mean(0)
    _, _, Vt = np.linalg.svd(S - c, full_matrices=False)
    n = Vt[2]
    if np.mean((scale * cameras - c) @ n) < 0:
        n = -n
    # R1 turns n onto +z (Rodrigues' rotation between two unit vectors).
    z = np.array([0.0, 0.0, 1.0])
    v, cos = np.cross(n, z), float(n @ z)
    if cos < -0.999999:  # upside down: half a turn about x
        R1 = np.diag([1.0, -1.0, -1.0])
    else:
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        R1 = np.eye(3) + vx + vx @ vx / (1 + cos)
    flat = (scale * X_ref - c) @ R1.T  # reference-sheet corners, floor-aligned, z ~ 0
    _, Rz, t2 = umeyama(np.c_[flat[:, :2], np.zeros(len(flat))], np.c_[Y_ref[:, :2], np.zeros(len(Y_ref))],
                        with_scale=False)
    # mat = Rz (R1 (s X - c)) + t2, so the rotation applied to s X is Rz R1
    # and the translation is t2 - Rz R1 c.
    R = Rz @ R1
    t = t2 - R @ c
    return R, t


def _fit_sheet(X: np.ndarray, Y: np.ndarray, keys: list) -> dict:
    """Similarity fit for one sheet, with residuals and a bootstrap standard error of the scale.

    Corners whose residual is far outside the rest (more than
    SHEET_OUTLIER_SIGMA robust standard deviations, and over 0.5 mm) are
    dropped and the fit redone, so one badly located corner can't move the
    scale. The robust spread is 1.4826 x the median absolute deviation,
    which equals the standard deviation for normal errors but ignores a few
    wild ones.
    """
    keys = list(keys)
    dropped = 0
    for _ in range(3):
        s, R, t = umeyama(X, Y)
        dist = np.linalg.norm(s * X @ R.T + t - Y, axis=1)
        sigma = 1.4826 * np.median(np.abs(dist - np.median(dist)))
        bad = dist > max(np.median(dist) + SHEET_OUTLIER_SIGMA * sigma, 0.5)
        if not bad.any() or len(X) - bad.sum() < MIN_CORNERS_PER_SHEET:
            break
        X, Y = X[~bad], Y[~bad]
        keys = [k for k, b in zip(keys, bad) if not b]
        dropped += int(bad.sum())
    s, R, t = umeyama(X, Y)
    res = s * X @ R.T + t - Y
    dist = np.linalg.norm(res, axis=1)
    # Bootstrap: refit on markers drawn with replacement (whole markers, since
    # a marker's four corners share its detection errors).
    rng = np.random.default_rng(0)
    markers = sorted({k[0] for k in keys})
    by_marker = {m: [i for i, k in enumerate(keys) if k[0] == m] for m in markers}
    scales = []
    for _ in range(BOOTSTRAP):
        pick = rng.choice(markers, len(markers))
        idx = [i for m in pick for i in by_marker[m]]
        if len(set(pick)) >= 3:
            scales.append(umeyama(X[idx], Y[idx])[0])
    se = float(np.std(scales)) if scales else None
    return dict(
        scale=s,
        n_corners=len(keys),
        n_markers=len(markers),
        residual_rms_mm=_rms(dist),
        residual_max_mm=round(float(dist.max()), 4),
        residual_out_of_plane_rms_mm=_rms(res[:, 2]),
        scale_se_pct=None if se is None else round(100 * se / s, 4),
        scale_se_mm_per_250mm=None if se is None else round(se / s * FOOT_LENGTH_MM, 3),
        outlier_corners_dropped=dropped,
        keys=keys,
    )


def _rms(v) -> float:
    return round(float(np.sqrt(np.mean(np.square(v)))), 4)
