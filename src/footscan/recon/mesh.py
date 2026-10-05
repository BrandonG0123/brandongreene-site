"""From a cloud of points to a clean surface (millimetres, mat frame).

The steps, in order, and what each one does to the geometry:

1. **Separate the subject from the floor.** In the mat frame the paper is
   the plane z = 0, so everything more than ``subject_min_z_mm`` above it is
   the subject. The floor points are kept aside: the accuracy study fits the
   "table top" to them.

2. **Outlier removal (statistical).** For each point, the mean distance to
   its k nearest neighbours. On a real surface that distance is about the
   point spacing; an isolated wrong point sits much further from everything.
   Points whose mean neighbour distance is more than ``outlier_std`` standard
   deviations above average are removed.

3. **Debris removal (connected pieces).** Mark which small cubes of space
   contain points and join cubes that touch; each joined group is one piece.
   The subject is the big piece; small floating pieces (a reflection matched
   to the wrong depth, a bit of the person's hand) are removed.

4. **Normals.** Which way the surface faces at each point: the direction in
   which its neighbourhood is thinnest (the smallest principal component of
   the neighbours' spread), flipped to face the cameras that saw it.

5. **Screened Poisson surface reconstruction** (Kazhdan & Hoppe 2013). Treat
   the oriented points as samples of the gradient of an "inside/outside"
   function and solve for the smooth function whose gradient best matches
   them (a Poisson equation), with an extra term pulling the zero level
   through the points themselves ("screening", which keeps detail). The
   surface is where the function crosses zero. It is closed and smooth by
   construction, which is also its weakness: where there were no points it
   invents a plausible surface.

6. **Cut at the floor.** Nothing real is below the paper; delete what's
   below z = 0. The open edge left behind is where the subject meets the mat.

7. **Trim invented surface.** Delete any part of the surface farther than
   ``trim_mm`` from every measured point. What remains is supported by data.

8. **Hole filling.** Small holes left by trimming (a patch of shiny or
   untextured surface) are closed by triangulating across them. Holes larger
   than ``max_hole_edges`` edges stay open: filling them would be guessing.

9. **Smoothing that keeps anatomy: Taubin.** Plain (Laplacian) smoothing
   moves each vertex toward the average of its neighbours, which removes
   noise but also shrinks the whole shape a little every step: an arch gets
   lower, a heel narrower. Taubin smoothing alternates a shrinking step
   (lambda > 0) with a slightly larger inflating step (mu < -lambda): together
   they act as a low-pass filter that removes millimetre-scale noise but
   leaves larger shapes and the overall size in place.

10. **Decimation (quadric edge collapse, Garland & Heckbert).** Repeatedly
    merge the two ends of the edge whose merging changes the surface least,
    measured as the summed squared distance to the planes of the original
    triangles around it. Flat regions lose many triangles; curved ones keep
    them. The report gives the largest distance this moved the surface.

Each step's effect on accuracy is measured on the calibration object
(accuracy.py), not assumed.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np


@dataclass(frozen=True)
class MeshConfig:
    subject_min_z_mm: float = 1.0
    outlier_k: int = 16
    outlier_std: float = 2.5
    piece_voxel_mm: float = 1.5
    min_piece_fraction: float = 0.02
    normal_k: int = 40
    poisson_depth: int = 10          # octree depth: cell ~ (box size) / 2^depth, ~0.25 mm for a foot
    poisson_samples_per_node: float = 2.0
    poisson_point_weight: float = 4.0
    trim_mm: float = 1.5
    max_hole_edges: int = 200
    taubin_lambda: float = 0.5
    taubin_mu: float = -0.53
    taubin_steps: int = 10
    target_faces: int = 200_000


def split_floor(P: np.ndarray, cfg: MeshConfig) -> tuple[np.ndarray, np.ndarray]:
    subject = P[:, 2] > cfg.subject_min_z_mm
    return subject, ~subject


def remove_outliers(P: np.ndarray, k: int, n_std: float) -> np.ndarray:
    from scipy.spatial import cKDTree

    d, _ = cKDTree(P).query(P, k + 1)
    m = d[:, 1:].mean(1)
    return m <= m.mean() + n_std * m.std()


def main_pieces(P: np.ndarray, voxel: float, min_fraction: float) -> np.ndarray:
    from scipy import ndimage

    idx = np.floor((P - P.min(0)) / voxel).astype(int)
    grid = np.zeros(idx.max(0) + 1, bool)
    grid[tuple(idx.T)] = True
    labels, n = ndimage.label(grid, structure=np.ones((3, 3, 3)))
    lab = labels[tuple(idx.T)]
    counts = np.bincount(lab, minlength=n + 1)
    keep_labels = np.flatnonzero(counts >= min_fraction * len(P))
    keep_labels = keep_labels[keep_labels > 0]
    return np.isin(lab, keep_labels)


def pca_normals(P: np.ndarray, hint: np.ndarray, k: int) -> np.ndarray:
    from scipy.spatial import cKDTree

    _, nb = cKDTree(P).query(P, k)
    Q = P[nb] - P[nb].mean(1, keepdims=True)
    cov = np.einsum("nki,nkj->nij", Q, Q)
    _, vec = np.linalg.eigh(cov)
    n = vec[:, :, 0]  # eigenvector of the smallest eigenvalue
    flip = np.einsum("ij,ij->i", n, hint) < 0
    n[flip] *= -1
    return n


def poisson(P: np.ndarray, N: np.ndarray, cfg: MeshConfig):
    import pymeshlab as ml
    import trimesh

    ms = ml.MeshSet()
    ms.add_mesh(ml.Mesh(vertex_matrix=P, v_normals_matrix=N))
    ms.generate_surface_reconstruction_screened_poisson(
        depth=cfg.poisson_depth, samplespernode=cfg.poisson_samples_per_node,
        pointweight=cfg.poisson_point_weight, preclean=True, threads=1)
    m = ms.current_mesh()
    return trimesh.Trimesh(m.vertex_matrix(), m.face_matrix(), process=True)


def cut_below_floor(mesh):
    """Delete triangles below the paper (centre below z = 0).

    The cut edge is as ragged as one triangle (~0.2 mm at Poisson depth 10);
    splitting triangles exactly along z = 0 would be tidier but changes
    nothing measurable.
    """
    out = mesh.copy()
    out.update_faces(mesh.triangles_center[:, 2] >= 0)
    out.remove_unreferenced_vertices()
    return out


def trim_unsupported(mesh, P: np.ndarray, max_dist: float):
    from scipy.spatial import cKDTree

    d, _ = cKDTree(P).query(mesh.triangles_center)
    keep = d <= max_dist
    out = mesh.copy()
    out.update_faces(keep)
    out.remove_unreferenced_vertices()
    return largest_piece(out)


def largest_piece(mesh):
    """The biggest connected surface (trimming can leave crumbs behind)."""
    import trimesh

    labels = trimesh.graph.connected_component_labels(mesh.face_adjacency, node_count=len(mesh.faces))
    if labels.max() == 0:
        return mesh
    out = mesh.copy()
    out.update_faces(labels == np.bincount(labels).argmax())
    out.remove_unreferenced_vertices()
    return out


def meshlab_finish(mesh, cfg: MeshConfig):
    """Hole filling, Taubin smoothing, decimation. Returns (smoothed, final)."""
    import pymeshlab as ml
    import trimesh

    ms = ml.MeshSet()
    ms.add_mesh(ml.Mesh(vertex_matrix=mesh.vertices, face_matrix=mesh.faces))
    ms.meshing_repair_non_manifold_edges()
    ms.meshing_close_holes(maxholesize=cfg.max_hole_edges, selfintersection=False, newfaceselected=False)
    # Any selection left behind restricts later filters (decimation silently
    # did nothing with the filled holes still selected).
    ms.set_selection_none()
    if cfg.taubin_steps:
        ms.apply_coord_taubin_smoothing(lambda_=cfg.taubin_lambda, mu=cfg.taubin_mu, stepsmoothnum=cfg.taubin_steps)
    smooth = ms.current_mesh()
    smoothed = trimesh.Trimesh(smooth.vertex_matrix(), smooth.face_matrix(), process=True)
    if len(smoothed.faces) > cfg.target_faces:
        ms.meshing_decimation_quadric_edge_collapse(
            targetfacenum=cfg.target_faces, preserveboundary=True, preservenormal=True,
            planarquadric=True, optimalplacement=True, autoclean=True)
    fin = ms.current_mesh()
    return smoothed, trimesh.Trimesh(fin.vertex_matrix(), fin.face_matrix(), process=True)


def color_vertices(mesh, P: np.ndarray, C: np.ndarray, k: int = 6) -> None:
    """Give each vertex the colour of the photographed points around it.

    Inverse-distance weighted average of the ``k`` nearest dense points'
    colours (nearer points count more). The surface itself is unchanged; the
    colour is what makes skin-marker stickers visible for landmarking.
    """
    from scipy.spatial import cKDTree

    if len(P) == 0 or C is None or len(C) != len(P):
        return
    C = np.asarray(C, float)
    if C.ndim == 1:
        C = np.repeat(C[:, None], 3, 1)
    d, idx = cKDTree(P).query(mesh.vertices, min(k, len(P)))
    w = 1.0 / (d + 0.05)
    rgb = (w[..., None] * C[idx]).sum(1) / w.sum(1, keepdims=True)
    alpha = np.full((len(rgb), 1), 255)
    mesh.visual.vertex_colors = np.hstack([np.clip(rgb * 255, 0, 255), alpha]).astype(np.uint8)


def surface_distance(a, b, n: int = 50_000, seed: int = 0) -> np.ndarray:
    """Distances from points spread evenly over mesh a's surface to mesh b's surface."""
    import trimesh

    from .geometry import SurfaceIndex

    pts, _ = trimesh.sample.sample_surface(a, n, seed=np.random.default_rng(seed))
    return SurfaceIndex(b).closest(pts)[1]


def run(P: np.ndarray, N: np.ndarray, cfg: MeshConfig = MeshConfig(), log=print):
    """Returns (final mesh, stages dict, floor points, report)."""
    t0 = time.time()
    subject, floor = split_floor(P, cfg)
    S, SN = P[subject], N[subject]
    ok = remove_outliers(S, cfg.outlier_k, cfg.outlier_std)
    n_out = int((~ok).sum())
    S, SN = S[ok], SN[ok]
    ok = main_pieces(S, cfg.piece_voxel_mm, cfg.min_piece_fraction)
    n_debris = int((~ok).sum())
    S, SN = S[ok], SN[ok]
    if len(S) < 500:
        raise RuntimeError(f"only {len(S)} points left on the subject; not enough for a surface")
    normals = pca_normals(S, SN, cfg.normal_k)
    log(f"mesh: Poisson surface from {len(S):,} points")
    raw = poisson(S, normals, cfg)
    cut = cut_below_floor(raw)
    trimmed = trim_unsupported(cut, S, cfg.trim_mm)
    smoothed, final = meshlab_finish(trimmed, cfg)
    decim = surface_distance(smoothed, final) if len(final.faces) < len(smoothed.faces) else np.zeros(1)
    report = dict(
        config=asdict(cfg),
        points_in=int(len(P)),
        floor_points=int(floor.sum()),
        subject_points=int(subject.sum()),
        outliers_removed=n_out,
        debris_removed=n_debris,
        points_meshed=int(len(S)),
        poisson_faces=int(len(raw.faces)),
        trimmed_faces=int(len(trimmed.faces)),
        final_faces=int(len(final.faces)),
        final_vertices=int(len(final.vertices)),
        decimation_max_deviation_mm=round(float(decim.max()), 4),
        decimation_p99_deviation_mm=round(float(np.percentile(decim, 99)), 4),
        surface_area_cm2=round(float(final.area) / 100, 2),
        seconds=round(time.time() - t0, 1),
    )
    stages = dict(poisson=raw, trimmed=trimmed, smoothed=smoothed, final=final)
    return final, stages, P[floor], report
