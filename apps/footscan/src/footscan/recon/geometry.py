"""Shared geometry: exact closest points on a triangle mesh, fast.

"How far is this point from that surface" is asked millions of times in
the accuracy study. The exact answer is the distance to the nearest point
on the nearest triangle. Checking every triangle is too slow, so:

1. Split the mesh's triangles until no edge is longer than ``max_edge`` mm
   (splitting doesn't change the surface, only how it's cut up).
2. Put the triangles' centres in a k-d tree (a spatial index that finds
   nearby points quickly) and, for each query point, take the ``k`` nearest
   triangle centres as candidates.
3. Compute the exact closest point on each candidate triangle and keep the
   nearest, at distance d.
4. Check the shortcut was safe. No point of a triangle is farther from its
   centre than the largest triangle "radius" r. So if the k-th nearest
   centre is at least d + r away, every triangle not checked is farther than
   d, and the answer is exact. Points failing that check (rare: crowded tiny
   triangles) are redone with every triangle whose centre is within d + r.

Inside or outside (the sign)
----------------------------
The side a point is on is the sign of (point - closest point) . normal.
Which normal matters: when the closest point is on an edge or a corner of
the mesh, the normal of whichever triangle happened to win is wrong for
points outside a sharp edge. The fix (Baerentzen & Aanaes 2005) is the
*angle-weighted pseudo-normal*: on a face, the face's normal; on an edge,
the sum of the two faces' normals; at a vertex, the sum of the surrounding
faces' normals each weighted by the angle the face makes at that vertex.
With those, the sign is correct everywhere on a closed mesh.
"""

from __future__ import annotations

import numpy as np


class SurfaceIndex:
    def __init__(self, mesh, max_edge: float = 1.0, k: int = 16):
        import trimesh
        from scipy.spatial import cKDTree

        v, f = trimesh.remesh.subdivide_to_size(mesh.vertices, mesh.faces, max_edge=max_edge)
        tri = v[f]
        tri_normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        # Zero-area triangles (repeated or collinear corners, which meshing can
        # leave behind) have no closest point to speak of and make the exact
        # formula divide by zero; they add nothing to the surface, so drop them.
        keep = np.linalg.norm(tri_normals, axis=1) > 1e-12
        tri_normals = tri_normals[keep]
        f = f[keep]
        m = trimesh.Trimesh(v, f, process=False)
        m.merge_vertices()  # shared corners, so edges and vertices know their neighbours (face order kept)
        self.faces = np.asarray(m.faces)
        self.triangles = np.asarray(m.vertices)[self.faces]
        self.normals = tri_normals / np.linalg.norm(tri_normals, axis=1, keepdims=True)
        # pseudo-normals: per edge, the sum of its faces' normals ...
        e = np.sort(self.faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
        nv = len(m.vertices)
        ekey = e[:, 0].astype(np.int64) * nv + e[:, 1]
        self.edge_keys, inv = np.unique(ekey, return_inverse=True)
        self.edge_normals = np.zeros((len(self.edge_keys), 3))
        np.add.at(self.edge_normals, inv.ravel(), np.repeat(self.normals, 3, axis=0))
        self.nv = nv
        # ... and per vertex, faces' normals weighted by their angle there
        ang = trimesh.triangles.angles(self.triangles)
        self.vertex_normals = np.zeros((nv, 3))
        np.add.at(self.vertex_normals, self.faces, self.normals[:, None, :] * ang[:, :, None])
        self.centres = self.triangles.mean(1)
        self.radius = float(np.linalg.norm(self.triangles - self.centres[:, None], axis=2).max())
        self.tree = cKDTree(self.centres)
        self.k = min(k, len(self.faces))

    def pseudo_normals(self, tri_idx: np.ndarray, cp: np.ndarray) -> np.ndarray:
        """Angle-weighted pseudo-normal at closest points ``cp`` on triangles ``tri_idx``."""
        from trimesh.triangles import points_to_barycentric

        bary = points_to_barycentric(self.triangles[tri_idx], cp)
        zero = np.abs(bary) < 1e-6
        nz = zero.sum(1)
        out = self.normals[tri_idx].copy()
        on_edge = np.flatnonzero(nz == 1)
        if len(on_edge):
            opp = zero[on_edge].argmax(1)  # the vertex the edge is opposite
            f = self.faces[tri_idx[on_edge]]
            a = f[np.arange(len(on_edge)), (opp + 1) % 3]
            b = f[np.arange(len(on_edge)), (opp + 2) % 3]
            key = np.minimum(a, b).astype(np.int64) * self.nv + np.maximum(a, b)
            out[on_edge] = self.edge_normals[np.searchsorted(self.edge_keys, key)]
        at_vertex = np.flatnonzero(nz >= 2)
        if len(at_vertex):
            corner = (~zero[at_vertex]).argmax(1)  # the one non-zero weight is the vertex
            out[at_vertex] = self.vertex_normals[self.faces[tri_idx[at_vertex], corner]]
        return out

    def closest(self, pts: np.ndarray, chunk: int = 50_000):
        """(closest points, distances, signed distances (+ on the side the normal faces))."""
        from trimesh.triangles import closest_point

        pts = np.asarray(pts, float)
        out_p = np.empty_like(pts)
        out_d = np.empty(len(pts))
        out_s = np.empty(len(pts))
        for a in range(0, len(pts), chunk):
            P = pts[a:a + chunk]
            _, cand = self.tree.query(P, self.k)
            cand = cand.reshape(len(P), -1)
            rep = np.repeat(P, cand.shape[1], axis=0)
            cp = closest_point(self.triangles[cand.ravel()], rep).reshape(len(P), cand.shape[1], 3)
            d = np.linalg.norm(cp - P[:, None, :], axis=2)
            d[~np.isfinite(d)] = np.inf  # never let a NaN win "nearest"
            j = d.argmin(1)
            rows = np.arange(len(P))
            best_cp = cp[rows, j]
            best_tri = cand[rows, j]
            dist = d[rows, j]
            kth = np.linalg.norm(self.centres[cand[:, -1]] - P, axis=1)
            for i in np.flatnonzero(kth < dist + self.radius):
                near = np.asarray(self.tree.query_ball_point(P[i], dist[i] + self.radius))
                cpi = closest_point(self.triangles[near], np.repeat(P[i:i + 1], len(near), axis=0))
                di = np.linalg.norm(cpi - P[i], axis=1)
                di[~np.isfinite(di)] = np.inf
                m = di.argmin()
                best_cp[i], best_tri[i], dist[i] = cpi[m], near[m], di[m]
            out_p[a:a + chunk] = best_cp
            out_d[a:a + chunk] = dist
            sign = np.sign(np.einsum("ij,ij->i", P - best_cp, self.pseudo_normals(best_tri, best_cp)))
            sign[sign == 0] = 1
            out_s[a:a + chunk] = sign * dist
        return out_p, out_d, out_s
