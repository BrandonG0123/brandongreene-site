"""Dense reconstruction: a depth for (nearly) every pixel, then one point cloud.

COLMAP's own dense step (PatchMatch stereo) only runs on an NVIDIA or AMD
GPU, which a Mac doesn't have, so this module does the same job on the CPU.
Everything around it (camera poses, lens, image undistortion conventions)
is COLMAP's.

Plane-sweep stereo (one depth map per photo)
--------------------------------------------
Take one photo as the *reference*. For a guess of depth d, every reference
pixel corresponds to one 3-D point, which lands somewhere in each of the
other ("source") photos. If d is right for that pixel, the small patch
around it looks the same in the reference and in the sources; if d is wrong,
it lands on something else.

Testing depths one pixel at a time would be slow. Instead, sweep a plane:
all pixels at the same depth d lie on a plane facing the reference camera,
and a plane maps between two photos by a single 3x3 **homography**

    H = K_s (R + t n^T / d) K_r^-1

(K: lens matrices, R and t: the source camera relative to the reference,
n: the plane's normal). So for each depth, warp each whole source photo
onto the reference with one homography and compare patches everywhere at
once.

The comparison is **normalised cross-correlation (NCC)** over a small
window: both patches are shifted to zero mean and scaled to unit spread
before being correlated, so a source photo that is brighter or dimmer
(lighting, exposure) still matches. NCC is 1 for identical patterns and
near 0 for unrelated ones. Cost = 1 - NCC.

Some sources won't see a given point (the object hides it). So for each
pixel, only the best few source costs are averaged: a hidden view can't drag
a correct depth down.

The depth with the lowest cost wins, and a parabola through the costs at
neighbouring depths places the minimum between the planes (sub-plane
precision). Depths are spaced evenly in *inverse* depth, because image
motion is proportional to 1/depth: that spacing moves the image by the same
fraction of a pixel per step everywhere.

Where to look
-------------
The subject sits on the mat, so we know roughly where it is: inside a box
above the mat that encloses COLMAP's sparse points. Each pixel's ray only
crosses that box between two depths; only those depths are tested, which
removes most of the ways a match can go wrong.

Trusting a depth (geometric consistency)
-----------------------------------------
A single depth map has errors: pixels with too little texture, reflections,
occlusion edges. A depth is kept only if **other photos' depth maps agree**:
project the point into a source photo, read that photo's own depth there,
send *that* point back to the reference, and check it lands within a pixel
of where it started and at the same depth. At least ``min_consistent``
sources must agree. The kept point is the average of the agreeing
estimates, which also reduces noise.

Finally, points closer together than ``voxel_mm`` are merged (averaged),
so dense areas don't dominate the surface fit.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np


@dataclass(frozen=True)
class DenseConfig:
    max_image_size: int = 1280        # long side of the images used for stereo
    num_sources: int = 6              # source photos compared against each reference
    best_sources: int = 3             # per pixel, average only this many best source costs
    window: int = 7                   # NCC window, pixels (odd)
    min_ncc: float = 0.6              # weaker matches are discarded
    min_texture: float = 0.01         # patch intensity spread below this (0-1 scale) is too plain to match
    plane_step_px: float = 0.5        # image motion between neighbouring depth planes
    max_planes: int = 320
    min_planes: int = 48
    min_tri_angle_deg: float = 5.0    # source/reference angle at the subject: too small = poor depth
    max_tri_angle_deg: float = 45.0   # too large = the surface looks too different
    discontinuity_rel: float = 0.015  # depth jump (fraction of depth) treated as an object edge
    max_height_mm: float = 250.0      # top of the search box: ankle and lower-leg landmarks fit under it
    near_fraction: float = 0.6        # nothing is searched nearer a camera than this x its nearest sparse points
    consistency_px: float = 1.0
    consistency_depth_rel: float = 0.01
    min_consistent: int = 2
    voxel_mm: float = 0.4
    box_margin_mm: float = 15.0


@dataclass
class View:
    name: str
    gray: np.ndarray       # float32, 0-1, undistorted
    K: np.ndarray          # OpenCV pixel convention
    R: np.ndarray          # world (mat mm) -> camera
    t: np.ndarray
    rgb: np.ndarray | None = None  # uint8, undistorted: colours the surface (skin-marker stickers)

    @property
    def center(self) -> np.ndarray:
        return -self.R.T @ self.t

    @property
    def axis(self) -> np.ndarray:
        return self.R[2]

    def project(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        c = X @ self.R.T + self.t
        z = c[:, 2]
        uv = (c @ self.K.T)[:, :2] / z[:, None]
        return uv, z


@dataclass
class DepthMap:
    x0: int
    y0: int
    depth: np.ndarray      # NaN where unknown
    cost: np.ndarray
    sources: list


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------
def load_views(rec, image_dir, max_image_size: int) -> list[View]:
    """Undistorted views (grayscale for matching, colour for the surface) with OpenCV-convention intrinsics.

    COLMAP's RADIAL lens model (u = x (1 + k1 r^2 + k2 r^4)) is the same
    formula as OpenCV's with only k1, k2 non-zero, so OpenCV can remove the
    distortion. COLMAP measures pixels from the image corner, OpenCV from
    the first pixel's centre: cx and cy differ by 0.5.
    """
    import cv2

    from .sfm import poses

    P = poses(rec)
    views = []
    for img in sorted(rec.images.values(), key=lambda i: i.name):
        if img.name not in P:
            continue
        cam = img.camera
        prm = [float(v) for v in cam.params]
        model = cam.model_name if hasattr(cam, "model_name") else str(cam.model)
        if "RADIAL" in model and len(prm) == 5:
            f, cx, cy, k1, k2 = prm
        elif "SIMPLE_RADIAL" in model and len(prm) == 4:
            (f, cx, cy, k1), k2 = prm, 0.0
        elif "SIMPLE_PINHOLE" in model and len(prm) == 3:
            (f, cx, cy), k1, k2 = prm, 0.0, 0.0
        else:
            raise ValueError(f"dense reconstruction supports RADIAL, SIMPLE_RADIAL or SIMPLE_PINHOLE lenses, not {model}")
        K = np.array([[f, 0, cx - 0.5], [0, f, cy - 0.5], [0, 0, 1.0]])
        dist = np.array([k1, k2, 0, 0, 0])
        bgr = cv2.imread(str(image_dir / img.name), cv2.IMREAD_COLOR)
        if bgr is None:
            raise FileNotFoundError(img.name)
        und = cv2.undistort(bgr, K, dist, None, K)
        s = min(1.0, max_image_size / max(und.shape[:2]))
        if s < 1.0:
            und = cv2.resize(und, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            K = K.copy()
            K[:2, :2] *= s
            # Scaling an image about its corner: centre-convention coords map as s (c + 0.5) - 0.5.
            K[0, 2] = s * (K[0, 2] + 0.5) - 0.5
            K[1, 2] = s * (K[1, 2] + 0.5) - 0.5
        R, t = P[img.name]
        gray = cv2.cvtColor(und, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        views.append(View(img.name, gray, K, R, t, cv2.cvtColor(und, cv2.COLOR_BGR2RGB)))
    return views


def subject_box(rec, board: dict, margin: float, max_height: float = 250.0):
    """Box (mm, mat frame) around what stands on the mat, from COLMAP's sparse points.

    Points on the paper (z ~ 0) or far off the mat (the room) are ignored;
    the remaining points above the paper belong to the subject. Percentiles
    rather than min/max keep a few stray points from inflating the box. The
    box bottom goes slightly below the paper so the floor around the subject
    is reconstructed too (the accuracy study uses it as the table top).
    The box stops ``max_height`` above the paper: the leg keeps going up,
    toward the cameras looking down, and a box reaching the cameras would make
    the depth search start at the lens.

    Smooth, plain skin can give COLMAP very few points to work with. Then the
    box is simply the space above the mat's middle (where the foot must be),
    which is larger, so slower, but still correct.
    Returns (lo, hi, centre, source).
    """
    xyz = np.array([p.xyz for p in rec.points3D.values()]).reshape(-1, 3)
    W, H = board["sheet_mm"]
    on_mat = (xyz[:, 0] > -20) & (xyz[:, 0] < W + 20) & (xyz[:, 1] > -20) & (xyz[:, 1] < 2 * H + 20)
    above = on_mat & (xyz[:, 2] > 2.0) & (xyz[:, 2] < max_height)
    if above.sum() >= 30:
        sub = xyz[above]
        lo = np.percentile(sub, 0.5, axis=0) - margin
        hi = np.percentile(sub, 99.5, axis=0) + margin
        centre = np.median(sub, axis=0)
        source = "sparse points"
    else:
        lo = np.array([-10.0, -10.0, 0.0])
        hi = np.array([W + 10.0, 2 * H + 10.0, max_height])  # tall enough for the lower-leg dots
        centre = np.array([W / 2, H, 30.0])
        source = f"mat area (only {int(above.sum())} sparse points above the paper)"
    lo[2] = -3.0
    hi[2] = min(hi[2], max_height)
    return lo, hi, centre, source


def near_limits(rec, views: list, lo, hi, fraction: float) -> dict[str, float]:
    """Per photo: the nearest depth worth searching (a fraction of its nearest sparse points' depth)."""
    xyz = np.array([p.xyz for p in rec.points3D.values()]).reshape(-1, 3)
    inside = np.all((xyz >= lo) & (xyz <= hi), axis=1)
    pts = xyz[inside] if inside.sum() >= 10 else xyz
    out = {}
    for v in views:
        z = (pts @ v.R.T + v.t)[:, 2]
        z = z[z > 0]
        out[v.name] = fraction * float(np.percentile(z, 2)) if len(z) >= 5 else 1.0
    return out


# --------------------------------------------------------------------------
# plane sweep
# --------------------------------------------------------------------------
def choose_sources(views: list[View], centre: np.ndarray, cfg: DenseConfig) -> dict[str, list[int]]:
    """For each reference, the sources whose viewing angle at the subject is useful.

    The angle between the two rays to the subject centre (the triangulation
    angle) sets depth precision: near 0 the rays are almost parallel and depth
    is ill-defined; very large and the surface looks too different to match.
    Prefer ~15 degrees, and similar distance (similar image scale).
    """
    out = {}
    dirs = np.array([v.center - centre for v in views])
    dist = np.linalg.norm(dirs, axis=1)
    unit = dirs / dist[:, None]
    for i, v in enumerate(views):
        ang = np.degrees(np.arccos(np.clip(unit @ unit[i], -1, 1)))
        ok = (ang >= cfg.min_tri_angle_deg) & (ang <= cfg.max_tri_angle_deg)
        ok[i] = False
        score = np.abs(ang - 15.0) + 20 * np.abs(np.log(dist / dist[i]))
        cand = np.flatnonzero(ok)
        out[v.name] = [int(j) for j in cand[np.argsort(score[cand])][: cfg.num_sources]]
    return out


def _pixel_rays(view: View, x0: int, y0: int, w: int, h: int) -> np.ndarray:
    u, v = np.meshgrid(np.arange(x0, x0 + w, dtype=np.float64), np.arange(y0, y0 + h, dtype=np.float64))
    Kinv = np.linalg.inv(view.K)
    d = np.stack([u, v, np.ones_like(u)], -1) @ Kinv.T  # camera coords with z = 1
    return d


def ray_box_depths(view: View, lo, hi) -> tuple[np.ndarray, np.ndarray]:
    """Per pixel, the depth range (camera z, mm) over which its ray is inside the box.

    Slab method: a ray enters and leaves each pair of parallel box faces at
    two parameters; it is inside the box between the latest entry and the
    earliest exit. Pixels whose ray misses get an empty range (NaN).
    """
    h, w = view.gray.shape
    d_cam = _pixel_rays(view, 0, 0, w, h).reshape(-1, 3)
    D = d_cam @ view.R  # world direction for depth parameter = camera z
    C = view.center
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (np.asarray(lo) - C) / D
        t2 = (np.asarray(hi) - C) / D
    tmin = np.nanmax(np.minimum(t1, t2), axis=1)
    tmax = np.nanmin(np.maximum(t1, t2), axis=1)
    tmin = np.maximum(tmin, 1.0)
    bad = ~(tmax > tmin)
    tmin[bad] = np.nan
    tmax[bad] = np.nan
    return tmin.reshape(h, w), tmax.reshape(h, w)


def _box_mean(img: np.ndarray, k: int) -> np.ndarray:
    import cv2

    return cv2.boxFilter(img, cv2.CV_32F, (k, k), normalize=True, borderType=cv2.BORDER_REFLECT)


def depth_map(ref: View, sources: list[View], lo, hi, cfg: DenseConfig, near: float = 1.0) -> DepthMap | None:
    import cv2

    tmin, tmax = ray_box_depths(ref, lo, hi)
    tmin = np.maximum(tmin, near)  # never search right up against the lens
    tmax = np.where(tmax > tmin, tmax, np.nan)
    tmin = np.where(np.isfinite(tmax), tmin, np.nan)
    valid = np.isfinite(tmin)
    if valid.sum() < 100 or not sources:
        return None
    ys, xs = np.nonzero(valid)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    w, h = x1 - x0, y1 - y0
    tmin, tmax = tmin[y0:y1, x0:x1].astype(np.float32), tmax[y0:y1, x0:x1].astype(np.float32)
    dmin, dmax = float(np.nanmin(tmin)), float(np.nanmax(tmax))

    k = cfg.window
    I = ref.gray[y0:y1, x0:x1]
    mu_r = _box_mean(I, k)
    var_r = np.maximum(_box_mean(I * I, k) - mu_r * mu_r, 0)
    textured = np.sqrt(var_r) >= cfg.min_texture

    # Each source relative to the reference: X_s = R_rel X_r + t_rel.
    rel = []
    for s in sources:
        R_rel = s.R @ ref.R.T
        t_rel = s.t - R_rel @ ref.t
        rel.append((s, R_rel, t_rel))

    # How many planes: enough that neighbouring planes move the image by at
    # most plane_step_px in the source where motion is largest.
    c = np.array([(x0 + x1) / 2, (y0 + y1) / 2, 1.0]) @ np.linalg.inv(ref.K).T
    span = 0.0
    for s, R_rel, t_rel in rel:
        pts = [(R_rel @ (c * d) + t_rel) for d in (dmin, dmax)]
        uv = [(s.K @ p)[:2] / p[2] for p in pts]
        span = max(span, float(np.linalg.norm(uv[1] - uv[0])))
    n_planes = int(np.clip(np.ceil(span / cfg.plane_step_px), cfg.min_planes, cfg.max_planes))
    inv = np.linspace(1 / dmin, 1 / dmax, n_planes)

    T_roi = np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1.0]])
    Kr_inv = np.linalg.inv(ref.K)
    nT = np.array([[0.0, 0.0, 1.0]])
    m = min(cfg.best_sources, len(rel))

    best = np.full((h, w), np.inf, np.float32)
    best_i = np.full((h, w), -1, np.int32)
    before = np.full((h, w), np.inf, np.float32)
    after = np.full((h, w), np.inf, np.float32)
    prev = np.full((h, w), np.inf, np.float32)
    costs = np.empty((len(rel), h, w), np.float32)
    for i, invd in enumerate(inv):
        d = 1.0 / invd
        for j, (s, R_rel, t_rel) in enumerate(rel):
            H = s.K @ (R_rel + np.outer(t_rel, nT) / d) @ Kr_inv @ T_roi
            Wp = cv2.warpPerspective(s.gray, H, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                                     borderMode=cv2.BORDER_CONSTANT, borderValue=-1.0)
            mu_s = _box_mean(Wp, k)
            var_s = np.maximum(_box_mean(Wp * Wp, k) - mu_s * mu_s, 0)
            cov = _box_mean(I * Wp, k) - mu_r * mu_s
            ncc = cov / np.sqrt(var_r * var_s + 1e-10)
            cst = 1.0 - ncc
            # A window that reaches past the source photo's edge compares
            # against the -1 fill value: no match there.
            outside = _box_mean((Wp < 0).astype(np.float32), k) > 0
            cst[outside | (var_s < 1e-8)] = 2.0
            costs[j] = cst
        agg = np.partition(costs, m - 1, axis=0)[:m].mean(0) if m < len(rel) else costs.mean(0)
        agg[(d < tmin) | (d > tmax) | ~np.isfinite(tmin)] = np.inf
        improved = agg < best
        # the plane just after the current best: its cost is the parabola's right point
        just_after = (best_i == i - 1) & ~improved
        after[just_after] = agg[just_after]
        before[improved] = prev[improved]
        after[improved] = np.inf
        best[improved] = agg[improved]
        best_i[improved] = i
        prev = agg

    # Sub-plane refinement: vertex of the parabola through (i-1, i, i+1).
    with np.errstate(invalid="ignore"):
        denom = before - 2 * best + after
    ok_par = np.isfinite(before) & np.isfinite(after) & (denom > 1e-6)
    delta = np.zeros((h, w), np.float32)
    delta[ok_par] = np.clip(0.5 * (before[ok_par] - after[ok_par]) / denom[ok_par], -0.5, 0.5)
    step = inv[1] - inv[0]
    inv_best = inv[0] + (best_i + delta) * step
    depth = (1.0 / inv_best).astype(np.float32)
    keep = (best_i > 0) & (best_i < n_planes - 1) & ok_par & (best <= 1 - cfg.min_ncc) & textured
    depth[~keep] = np.nan
    depth[edge_band(depth, cfg.discontinuity_rel, k // 2 + 1)] = np.nan
    return DepthMap(int(x0), int(y0), depth, best, [s.name for s in sources])


def edge_band(depth: np.ndarray, rel: float, radius: int) -> np.ndarray:
    """Pixels within ``radius`` of a sudden depth jump.

    A matching window that straddles the edge of an object against the floor
    contains both; the object's texture usually wins, so floor pixels next
    to the edge get the object's depth and the object comes out slightly
    fat. Removing a band as wide as half the window on both sides of every
    jump removes those pixels (other photos, which see the same place away
    from an edge, fill it back in).
    """
    import cv2

    d = np.nan_to_num(depth, nan=0.0)
    valid = np.isfinite(depth)
    jump = np.zeros(depth.shape, bool)
    for dy, dx in ((0, 1), (1, 0)):
        a = d[: d.shape[0] - dy, : d.shape[1] - dx]
        b = d[dy:, dx:]
        both = valid[: d.shape[0] - dy, : d.shape[1] - dx] & valid[dy:, dx:]
        j = both & (np.abs(a - b) > rel * np.minimum(a, b))
        jump[: d.shape[0] - dy, : d.shape[1] - dx] |= j
        jump[dy:, dx:] |= j
    if not jump.any():
        return jump
    kernel = np.ones((2 * radius + 1, 2 * radius + 1), np.uint8)
    return cv2.dilate(jump.astype(np.uint8), kernel) > 0


# --------------------------------------------------------------------------
# consistency + fusion
# --------------------------------------------------------------------------
def _backproject(view: View, dm: DepthMap) -> tuple[np.ndarray, np.ndarray]:
    h, w = dm.depth.shape
    d = _pixel_rays(view, dm.x0, dm.y0, w, h)
    Xc = d * dm.depth[..., None]
    return Xc, (Xc.reshape(-1, 3) - view.t) @ view.R  # camera coords (h, w, 3), world (N, 3)


def fuse(views: list[View], maps: dict[str, DepthMap], cfg: DenseConfig, log=print):
    by_name = {v.name: v for v in views}
    pts, nrm, col = [], [], []
    for v in views:
        dm = maps.get(v.name)
        if dm is None:
            continue
        _, Xw = _backproject(v, dm)
        h, w = dm.depth.shape
        flat_ok = np.isfinite(dm.depth).ravel()
        if not flat_ok.any():
            continue
        Xw = Xw[flat_ok]
        # Which way the surface faces is unknown here, but it certainly faces
        # the camera that saw it: keep the direction to that camera.
        Vw = v.center - Xw
        Vw /= np.linalg.norm(Vw, axis=1, keepdims=True)
        uv_r = np.stack(np.meshgrid(np.arange(dm.x0, dm.x0 + w), np.arange(dm.y0, dm.y0 + h)), -1).reshape(-1, 2)[flat_ok]
        z_r = dm.depth.ravel()[flat_ok]
        acc = Xw.copy()
        count = np.zeros(len(Xw), np.int32)
        for sname in dm.sources:
            s, sm = by_name[sname], maps.get(sname)
            if sm is None:
                continue
            uv_s, _ = s.project(Xw)
            iu = np.round(uv_s[:, 0]).astype(int) - sm.x0
            iv = np.round(uv_s[:, 1]).astype(int) - sm.y0
            sh, sw = sm.depth.shape
            inside = (iu >= 0) & (iu < sw) & (iv >= 0) & (iv < sh)
            ds = np.full(len(Xw), np.nan)
            ds[inside] = sm.depth[iv[inside], iu[inside]]
            ok = np.isfinite(ds)
            if not ok.any():
                continue
            # The source's own 3-D point at that pixel, sent back to the reference.
            rays = np.c_[iu[ok] + sm.x0, iv[ok] + sm.y0, np.ones(ok.sum())] @ np.linalg.inv(s.K).T
            Xs = ((rays * ds[ok, None]) - s.t) @ s.R
            uv_back, z_back = v.project(Xs)
            agree = (np.linalg.norm(uv_back - uv_r[ok], axis=1) <= cfg.consistency_px) & (
                np.abs(z_back - z_r[ok]) <= cfg.consistency_depth_rel * z_r[ok])
            idx = np.flatnonzero(ok)[agree]
            acc[idx] += Xs[agree]
            count[idx] += 1
        keep = count >= cfg.min_consistent
        pts.append(acc[keep] / (count[keep, None] + 1))
        nrm.append(Vw[keep])
        img = v.rgb if v.rgb is not None else v.gray
        col.append(img[uv_r[keep, 1], uv_r[keep, 0]] / (255.0 if v.rgb is not None else 1.0))
    if not pts:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3))
    P, N, C = np.vstack(pts), np.vstack(nrm), np.concatenate(col)
    log(f"dense: {len(P):,} consistent points before merging")
    return voxel_merge(P, N, C, cfg.voxel_mm)


def voxel_merge(P, N, C, voxel: float):
    """Average all points falling in the same voxel (cube of side ``voxel`` mm)."""
    keys = np.floor(P / voxel).astype(np.int64)
    _, inv, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    inv = inv.ravel()
    n = len(counts)
    Pm = np.stack([np.bincount(inv, P[:, i], n) for i in range(3)], 1) / counts[:, None]
    Nm = np.stack([np.bincount(inv, N[:, i], n) for i in range(3)], 1)
    Nm /= np.linalg.norm(Nm, axis=1, keepdims=True) + 1e-12
    if C.ndim == 1:
        Cm = np.bincount(inv, C, n) / counts
    else:  # colour: average each channel
        Cm = np.stack([np.bincount(inv, C[:, i], n) for i in range(C.shape[1])], 1) / counts[:, None]
    return Pm, Nm, Cm


def locate_subject(rec, image_dir, views, lo, hi, centre, cfg: DenseConfig, log=print):
    """Find the subject with a quick, coarse depth pass when COLMAP found too little on it.

    The full-detail search over the whole mat area is slow (most of every
    photo, every depth from the paper to the top of the box). A pass at a
    quarter of the resolution, on every other photo, with coarser depth
    steps, takes a small fraction of that and is plenty to see where the
    subject stands; the full pass then searches only around it.
    """
    import dataclasses

    coarse = dataclasses.replace(cfg, max_image_size=max(320, cfg.max_image_size // 3), plane_step_px=1.0,
                                 max_planes=96, min_planes=32, min_consistent=1)
    small = load_views(rec, image_dir, coarse.max_image_size)[::2]
    src = choose_sources(small, centre, coarse)
    near = near_limits(rec, small, lo, hi, cfg.near_fraction)
    maps = {}
    for v in small:
        sources = [small[j] for j in src[v.name] if j < len(small)]
        dm = depth_map(v, sources, lo, hi, coarse, near[v.name])
        if dm is not None:
            maps[v.name] = dm
    P, _, _ = fuse(small, maps, coarse, log=lambda *a: None)
    up = P[(P[:, 2] > 3.0) & np.all((P >= lo) & (P <= hi), axis=1)] if len(P) else P
    log(f"dense: quick pass found {len(up)} points on the subject")
    if len(up) < 200:
        return None
    new_lo = np.percentile(up, 1, axis=0) - cfg.box_margin_mm
    new_hi = np.percentile(up, 99, axis=0) + cfg.box_margin_mm
    new_lo[2] = -3.0
    new_hi[2] = min(new_hi[2], cfg.max_height_mm)
    return np.maximum(new_lo, lo), np.minimum(new_hi, hi), np.median(up, axis=0)


def run(rec, image_dir, board: dict, cfg: DenseConfig = DenseConfig(), log=print):
    """Depth maps for every registered photo, fused into one point cloud (mat frame, mm).

    Returns points, view directions (unit vectors toward the cameras that saw
    each point: used to orient surface normals), RGB colours (0-1), report.
    """
    t0 = time.time()
    views = load_views(rec, image_dir, cfg.max_image_size)
    lo, hi, centre, box_source = subject_box(rec, board, cfg.box_margin_mm, cfg.max_height_mm)
    if box_source.startswith("mat area"):
        found = locate_subject(rec, image_dir, views, lo, hi, centre, cfg, log)
        if found is not None:
            lo, hi, centre = found
            box_source += "; narrowed by a quick low-resolution pass"
    near = near_limits(rec, views, lo, hi, cfg.near_fraction)
    sources = choose_sources(views, centre, cfg)
    maps = {}
    for i, v in enumerate(views, 1):
        dm = depth_map(v, [views[j] for j in sources[v.name]], lo, hi, cfg, near[v.name])
        if dm is not None:
            maps[v.name] = dm
        if i % 5 == 0 or i == len(views):
            log(f"dense: depth maps {i}/{len(views)}")
    P, N, C = fuse(views, maps, cfg, log)
    report = dict(
        config=asdict(cfg),
        views=len(views),
        depth_maps=len(maps),
        box_mm=dict(lo=[round(float(v), 1) for v in lo], hi=[round(float(v), 1) for v in hi]),
        box_from=box_source,
        points=int(len(P)),
        valid_depth_fraction=round(float(np.mean([np.isfinite(m.depth).mean() for m in maps.values()])), 3) if maps else 0,
        seconds=round(time.time() - t0, 1),
    )
    return P, N, C, report
