"""A compact binary copy of a mesh for the studio's 3-D viewer.

PLY is easy to write but awkward to parse in a browser. The viewer instead
loads ``viewer.bin``: a 16-byte header, then the arrays exactly as WebGL
wants them, so loading is one download and four typed-array views.

    bytes 0-3    b"FSV1"
    4-7          vertex count (uint32, little-endian)
    8-11         triangle count (uint32)
    12-15        flags (uint32): bit 0 = has colours
    float32 x 3 per vertex     positions, mm (the mesh's own coordinates)
    uint8 x 3 per vertex       colours (if flagged), then zero padding to 4 bytes
    uint32 x 3 per triangle    vertex indices
"""

from __future__ import annotations

import struct
from pathlib import Path

import numpy as np

MAGIC = b"FSV1"


def write(mesh, path: Path) -> None:
    V = np.asarray(mesh.vertices, np.float32)
    F = np.asarray(mesh.faces, np.uint32)
    colors = None
    vc = getattr(mesh.visual, "vertex_colors", None) if mesh.visual.kind == "vertex" else None
    if vc is not None and len(vc) == len(V):
        colors = np.asarray(vc, np.uint8)[:, :3]
    with open(path, "wb") as fh:
        fh.write(MAGIC + struct.pack("<III", len(V), len(F), 1 if colors is not None else 0))
        fh.write(V.tobytes())
        if colors is not None:
            fh.write(colors.tobytes())
            fh.write(b"\0" * ((-colors.size) % 4))
        fh.write(F.tobytes())


def read(path: Path) -> dict:
    """Inverse of write (for tests and tools)."""
    data = Path(path).read_bytes()
    if data[:4] != MAGIC:
        raise ValueError("not a viewer.bin file")
    nv, nf, flags = struct.unpack("<III", data[4:16])
    off = 16
    V = np.frombuffer(data, np.float32, nv * 3, off).reshape(nv, 3)
    off += nv * 12
    C = None
    if flags & 1:
        C = np.frombuffer(data, np.uint8, nv * 3, off).reshape(nv, 3)
        off += nv * 3 + (-(nv * 3)) % 4
    F = np.frombuffer(data, np.uint32, nf * 3, off).reshape(nf, 3)
    return dict(vertices=V, faces=F, colors=C)
