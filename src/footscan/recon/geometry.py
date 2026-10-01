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
"""

from __future__ import annotations

import numpy as np


class SurfaceIndex:
    def __init__(self, mesh, max_edge: float = 1.0, k: int = 16):
        import trimesh
        from scipy.spatial import cKDTree

        v, f = trimesh.remesh.subdivide_to_size(mesh.vertices, mesh.faces, max_edge=max_edge)
        self.triangles = v[f]
        tri_normals = np.cross(self.triangles[:, 1] - self.triangles[:, 0], self.triangles[:, 2] - self.triangles[:, 0])
        self.normals = tri_normals / (np.linalg.norm(tri_normals, axis=1, keepdims=True) + 1e-18)
        self.centres = self.triangles.mean(1)
        self.radius = float(np.linalg.norm(self.triangles - self.centres[:, None], axis=2).max())
        self.tree = cKDTree(self.centres)
        self.k = min(k, len(f))

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
                m = di.argmin()
                best_cp[i], best_tri[i], dist[i] = cpi[m], near[m], di[m]
            out_p[a:a + chunk] = best_cp
            out_d[a:a + chunk] = dist
            sign = np.sign(np.einsum("ij,ij->i", P - best_cp, self.normals[best_tri]))
            sign[sign == 0] = 1
            out_s[a:a + chunk] = sign * dist
        return out_p, out_d, out_s
