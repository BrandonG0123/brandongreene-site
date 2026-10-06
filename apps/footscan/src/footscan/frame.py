"""Foot coordinate frame.

Every measurement in this project is expressed in a frame attached to the
foot, not to the camera or the room. A scan's raw coordinates are arbitrary
(photogrammetry picks its own origin and orientation), so nothing is
comparable across scans until it has been put in this frame.

Construction
------------
1. **Reference plane (the "floor" of the foot).**
   - If the scan supplies a ``support_plane`` (the marker board the foot is
     standing on, in ``swb``/``fwb``), use it.
   - Otherwise fit the plane through three plantar skin landmarks: under the
     calcaneus, 1st and 5th metatarsal heads (the "tripod"). Three points
     define a plane exactly: normal = (b - a) x (c - a).
   In weight-bearing those plantar points lie on the floor, so the two
   definitions coincide; in ``nwb`` the tripod is the only floor available.

2. **z axis (up)** = plane normal, sign chosen so that dorsal landmarks
   (navicular, malleoli) have positive height. The sign of a cross product
   depends on point order, so we fix it from anatomy instead of trusting it.

3. **x axis (anterior)** = heel_posterior -> midpoint of the 1st and 5th MTP
   joint markers, *projected into the reference plane*. Projection removes
   the component along the normal: ``v - (v . n) n``. Without it, a foot
   scanned with the toes slightly raised would tilt the long axis and every
   length would shrink by cos(tilt).

4. **medial axis** = z x x gives the foot's left. For a right foot that is
   medial; for a left foot, medial is the negative. Using a "medial" axis
   rather than a fixed left/right one means a left and right foot produce
   angles with the same sign convention (the frame is mirror-imaged for left
   feet, which is intended).

5. **origin** = heel_posterior projected onto the reference plane.

Local coordinates are ``[anterior, medial, up]`` in millimetres.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

DORSAL_KEYS = ("navicular_tuberosity", "malleolus_medial", "malleolus_lateral")
TRIPOD_KEYS = ("calc_plantar", "mth1_plantar", "mth5_plantar")


class FrameError(ValueError):
    pass


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n < 1e-9:
        raise FrameError("degenerate vector (landmarks coincident or collinear)")
    return v / n


def plane_from_points(a, b, c) -> tuple[np.ndarray, np.ndarray]:
    a, b, c = (np.asarray(p, float) for p in (a, b, c))
    return a, _unit(np.cross(b - a, c - a))


@dataclass(frozen=True)
class FootFrame:
    origin: np.ndarray
    anterior: np.ndarray
    medial: np.ndarray
    up: np.ndarray
    foot: str
    plane_source: str  # "support_plane" or "plantar_tripod"

    @property
    def rotation(self) -> np.ndarray:
        """Rows are the local axes, so ``R @ (p - origin)`` gives local coords."""
        return np.vstack([self.anterior, self.medial, self.up])

    def to_local(self, points) -> np.ndarray:
        p = np.asarray(points, float)
        return (p - self.origin) @ self.rotation.T


def build_frame(landmarks: dict, foot: str, support_plane: dict | None = None) -> FootFrame:
    if foot not in ("left", "right"):
        raise FrameError(f"foot must be 'left' or 'right', got {foot!r}")
    lm = {k: np.asarray(v, float) for k, v in landmarks.items() if v is not None}

    if support_plane is not None:
        p0 = np.asarray(support_plane["point"], float)
        n = _unit(np.asarray(support_plane["normal"], float))
        source = "support_plane"
    else:
        missing = [k for k in TRIPOD_KEYS if k not in lm]
        if missing:
            raise FrameError(
                f"no support_plane and plantar tripod incomplete (missing {missing}); "
                "weight-bearing scans must supply the board plane"
            )
        p0, n = plane_from_points(*(lm[k] for k in TRIPOD_KEYS))
        source = "plantar_tripod"

    dorsal = [lm[k] for k in DORSAL_KEYS if k in lm]
    if not dorsal:
        raise FrameError(f"need at least one dorsal landmark {DORSAL_KEYS} to orient 'up'")
    if np.mean([(d - p0) @ n for d in dorsal]) < 0:
        n = -n

    for k in ("heel_posterior", "mtpj1_medial", "mtpj5_lateral"):
        if k not in lm:
            raise FrameError(f"missing landmark {k!r} (needed for the long axis)")

    def project_point(p):
        return p - ((p - p0) @ n) * n

    heel = project_point(lm["heel_posterior"])
    fore = project_point((lm["mtpj1_medial"] + lm["mtpj5_lateral"]) / 2)
    x = _unit(fore - heel)
    left = np.cross(n, x)
    medial = left if foot == "right" else -left
    return FootFrame(heel, x, medial, n, foot, source)
