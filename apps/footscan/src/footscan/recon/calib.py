"""The printed calibration object: a shape we know exactly, for measuring scan accuracy.

Why a printed object
--------------------
"Accuracy" means comparing a scan against the truth. For a foot there is no
truth to compare against: the foot is the thing being measured. So the
accuracy study scans something whose shape *is* known: this object, printed
on the same printer that will print the insoles, and checked with calipers.

What the shape tests
--------------------
Foot-sized (150 x 70 mm, up to 35 mm tall) and deliberately asymmetric, so
there is exactly one way to line the scan up with the model. Each feature
tests something different:

    base slab        flat top, 10 mm      -> height accuracy near the floor
    dome             20 mm radius sphere  -> a curved surface, like a heel or an arch
    ramp             10 -> 35 mm over 45 mm (29 deg) -> a slanted surface
    two terraces     35 mm and 22 mm      -> flat tops at known heights, and
                                             13 mm vertical walls between them

Everything is a "heightfield over the footprint": every point of the top
surface sits directly above the bed. That means it prints base-down with no
supports, and the bottom (which the camera can't see, like a sole on the
floor) is a flat face we leave out of the comparison.

Coordinates (mm): x along the length (dome end at x = 0), y across, z up,
bottom face at z = 0. In a scan, the object sits on the mat, so its z = 0 is
the paper.

The caliper checks
------------------
A printer is not perfect (typically +-0.1-0.3 mm, and plastic shrinks a
little as it cools), so the model is the *intended* shape and the calipers
tell us the *actual* one. ``CALIPER_CHECKS`` lists what to measure. The
accuracy report shows each one three ways: the model, your calipers, and the
scan; and it warns if print and model disagree by more than the printer's
usual error, because then the model is no longer a fair reference.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

LENGTH = 150.0
WIDTH = 70.0
BASE = 10.0
DOME_CENTER = (32.0, 35.0)
DOME_RADIUS = 20.0
RAMP_X = (60.0, 105.0)
RAMP_TOP = 35.0
TERRACE_SPLIT_Y = 38.0  # high terrace for y < split, low terrace beyond
TERRACE_HIGH = 35.0
TERRACE_LOW = 22.0
# Finer than any printer can reproduce: the sphere's facets differ from a true
# sphere by r * (1 - cos(pi / n)) = 0.0015 mm.
SPHERE_SEGMENTS = 256

PRINT_TOLERANCE_MM = 0.4  # model vs. calipers beyond this: the print is not a fair reference


@dataclass(frozen=True)
class CaliperCheck:
    key: str
    label: str
    nominal_mm: float
    how: str


CALIPER_CHECKS = (
    CaliperCheck("length", "Overall length", LENGTH, "End to end, along the long side, at the base."),
    CaliperCheck("width", "Overall width", WIDTH, "Side to side, across the base."),
    CaliperCheck("base", "Base thickness", BASE, "Depth rod, at the dome end, between the dome and the edge."),
    CaliperCheck("dome_apex", "Dome top height", BASE + DOME_RADIUS, "Table to the very top of the dome."),
    CaliperCheck("terrace_high", "High terrace height", TERRACE_HIGH, "Table to the top of the taller flat end."),
    CaliperCheck("terrace_low", "Low terrace height", TERRACE_LOW, "Table to the top of the lower flat end."),
)


def build():
    """The object as a watertight triangle mesh (trimesh.Trimesh), millimetres.

    Built with constructive solid geometry (CSG): simple solids combined with
    exact boolean union and intersection, so faces meet cleanly instead of
    overlapping. Manifold, the CSG library, guarantees a closed result.
    """
    import manifold3d as m3
    import trimesh

    M = m3.Manifold
    base = M.cube((LENGTH, WIDTH, BASE))

    # Dome: a sphere centred on the base's top face; only the upper half
    # survives the union because the lower half is inside the base already.
    # Its equator is vertical and it narrows upward, so it never overhangs.
    cx, cy = DOME_CENTER
    dome = M.sphere(DOME_RADIUS, SPHERE_SEGMENTS).translate((cx, cy, BASE))
    dome = dome ^ M.cube((LENGTH, WIDTH, BASE + DOME_RADIUS + 1))  # clip anything below the bed

    # Ramp: a right-triangle profile drawn in the x-z plane, extruded across
    # the full width. Extrusion runs along +z, so draw the profile in (x, z)
    # as (x, y) and rotate the extruded solid so its old z becomes +y.
    x0, x1 = RAMP_X
    profile = m3.CrossSection([[(x0, BASE), (x1, BASE), (x1, RAMP_TOP), (x0, BASE)]])
    ramp = profile.extrude(WIDTH).rotate((90.0, 0.0, 0.0)).translate((0.0, WIDTH, 0.0))

    high = M.cube((LENGTH - x1, TERRACE_SPLIT_Y, TERRACE_HIGH)).translate((x1, 0.0, 0.0))
    low = M.cube((LENGTH - x1, WIDTH - TERRACE_SPLIT_Y, TERRACE_LOW)).translate((x1, TERRACE_SPLIT_Y, 0.0))

    solid = M.batch_boolean([base, dome, ramp, high, low], m3.OpType.Add)
    mesh = solid.to_mesh()
    verts = np.asarray(mesh.vert_properties, float)[:, :3]
    faces = np.asarray(mesh.tri_verts, np.int64)
    out = trimesh.Trimesh(verts, faces, process=True)
    if not out.is_watertight:
        raise RuntimeError("calibration object mesh is not watertight")
    return out


def height(x, y):
    """Exact height of the top surface at (x, y), mm. NaN outside the footprint.

    The analytic description of the same shape ``build()`` makes. The tests
    check the two agree, and the accuracy code uses this to know which part
    of the surface each scan point belongs to.
    """
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    z = np.full(np.broadcast(x, y).shape, BASE)
    r2 = (x - DOME_CENTER[0]) ** 2 + (y - DOME_CENTER[1]) ** 2
    dome = np.where(r2 < DOME_RADIUS**2, BASE + np.sqrt(np.clip(DOME_RADIUS**2 - r2, 0, None)), BASE)
    z = np.maximum(z, dome)
    x0, x1 = RAMP_X
    in_ramp = (x >= x0) & (x <= x1)
    z = np.where(in_ramp, np.maximum(z, BASE + (x - x0) / (x1 - x0) * (RAMP_TOP - BASE)), z)
    terr = np.where(y < TERRACE_SPLIT_Y, TERRACE_HIGH, TERRACE_LOW)
    z = np.where(x > x1, np.maximum(z, terr), z)
    inside = (x >= 0) & (x <= LENGTH) & (y >= 0) & (y <= WIDTH)
    return np.where(inside, z, np.nan)


def regions():
    """Named patches of the surface used to measure the scan like calipers would.

    Each is a test on reference-frame points (x, y, z) -> bool, kept a few
    millimetres away from edges, where any reconstruction rounds corners off.
    ``kind`` says what to fit: a horizontal plane (its height) or a sphere.
    """
    m = 3.0
    x0, x1 = RAMP_X
    cx, cy = DOME_CENTER
    return {
        "base": dict(kind="plane_z", nominal=BASE, test=lambda p: (
            (p[:, 0] > m) & (p[:, 0] < cx - DOME_RADIUS - m) & (p[:, 1] > m) & (p[:, 1] < WIDTH - m)
            | (p[:, 0] > m) & (p[:, 0] < x0 - m) & ((p[:, 1] < cy - DOME_RADIUS - m) | (p[:, 1] > cy + DOME_RADIUS + m))
            & (p[:, 1] > m) & (p[:, 1] < WIDTH - m))),
        "terrace_high": dict(kind="plane_z", nominal=TERRACE_HIGH, test=lambda p: (
            (p[:, 0] > x1 + m) & (p[:, 0] < LENGTH - m) & (p[:, 1] > m) & (p[:, 1] < TERRACE_SPLIT_Y - m))),
        "terrace_low": dict(kind="plane_z", nominal=TERRACE_LOW, test=lambda p: (
            (p[:, 0] > x1 + m) & (p[:, 0] < LENGTH - m) & (p[:, 1] > TERRACE_SPLIT_Y + m) & (p[:, 1] < WIDTH - m))),
        "dome": dict(kind="sphere", nominal=DOME_RADIUS, center=(cx, cy, BASE), test=lambda p: (
            ((p[:, 0] - cx) ** 2 + (p[:, 1] - cy) ** 2 < (DOME_RADIUS - m) ** 2) & (p[:, 2] > BASE + m))),
    }


def write_stl(path) -> dict:
    mesh = build()
    mesh.export(path)
    return dict(path=str(path), faces=int(len(mesh.faces)), extents_mm=[round(float(v), 3) for v in mesh.extents],
                volume_cm3=round(float(mesh.volume) / 1000, 2))
