"""Printable scan mat: ArUco markers at exact, known millimetre positions.

Why a mat
---------
Photogrammetry recovers shape but not size: a foot and a model of a foot
twice as big produce identical photos. Markers of known size in the scene fix
the scale. Get this wrong and every measurement downstream is quietly wrong,
so the mat is built to be checkable at each step:

1. Markers are drawn as **vector** squares in a PDF whose page size and
   drawing units are exact millimetres. Nothing is rasterised, so the file
   itself has no resampling error.
2. Every page carries a **100 mm check bar**. Printers love "fit to page",
   which shrinks everything by a few percent; measuring the bar with a ruler
   catches that before a single scan is taken.
3. The two sheets use **different marker IDs** and are treated independently
   downstream. Scale recovered from each sheet should agree; the disagreement
   is a free, honest estimate of scale error, including tape-seam
   misalignment, which never enters the calculation.
4. Tests render the actual PDF and detect the markers with both OpenCV and
   the browser detector (js-aruco2), checking IDs and corner positions.

Layout (each sheet, mm, origin at the paper's bottom-left, y up)
-----------------------------------------------------------------
Two sheets tape together end to end: sheet 1 (heel) below, sheet 2 (toes)
above. Markers run up both long edges and across the outer end, leaving the
middle clear for the foot. The seam edge has no markers, so tape can't cover
any.

Mat coordinates: x to the right, y toward the toes, z up out of the paper.
Sheet 1's origin is the mat origin; sheet 2 nominally sits at (0, H).

Dictionary: ARUCO_MIP_36h12 (6x6 bits, minimum Hamming distance 12). The
large distance makes misreads essentially impossible, which matters when a
wrong ID would put a corner in the wrong place.
"""

from __future__ import annotations

import json
import zlib
from dataclasses import dataclass
from pathlib import Path

PAPER = {"letter": (215.9, 279.4), "a4": (210.0, 297.0)}
ID_BASE = {"letter": 0, "a4": 100}
DICTIONARY = "ARUCO_MIP_36h12"
MARKER_MM = 30.0
GAP_MM = 6.0
MARGIN_MM = 10.0
SEAM_CLEAR_MM = 22.0
# Two check bars, so people can use whichever ruler they have: an exact
# 10 cm bar and an exact 4 inch bar. Measuring "100 mm" on an inch ruler is
# needlessly awkward, and a mis-scaled print is the failure we must catch.
CHECK_BARS = [
    {"unit": "cm", "value": 10.0, "length_mm": 100.0, "label": "10 cm exactly"},
    {"unit": "in", "value": 4.0, "length_mm": 101.6, "label": "4 inches exactly"},
]
CHECK_BAR_MM = CHECK_BARS[0]["length_mm"]
# A ruler can be read to about half a millimetre; "fit to page" is out by 3-6 mm.
CHECK_TOLERANCE_MM = 1.5
MM_TO_PT = 72 / 25.4
VERSION = 1


def marker_bits(marker_id: int):
    """8x8 cells, 1 = black, row 0 at the top (including the black border)."""
    import cv2

    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_MIP_36h12)
    img = cv2.aruco.generateImageMarker(d, marker_id, 8, borderBits=1)
    return (img < 128).astype(int).tolist()


@dataclass
class PlacedMarker:
    id: int
    x: float  # bottom-left corner, sheet mm
    y: float

    def corners(self) -> list[list[float]]:
        """TL, TR, BR, BL of the upright marker, the order ArUco detectors report."""
        s = MARKER_MM
        return [[self.x, self.y + s], [self.x + s, self.y + s], [self.x + s, self.y], [self.x, self.y]]


def sheet_layout(paper: str, sheet: str) -> list[PlacedMarker]:
    W, H = PAPER[paper]
    s, g, m = MARKER_MM, GAP_MM, MARGIN_MM
    step = s + g
    rows = int((H - m - SEAM_CLEAR_MM - s) // step) + 1
    cols_x = [m, W - m - s]
    # Markers between the two columns on the outer-end row, centred.
    inner = W - 2 * (m + s) - 2 * g
    n_end = int((inner + g) // step)
    end_x0 = m + s + g + (inner - (n_end * s + (n_end - 1) * g)) / 2
    end_xs = [end_x0 + i * step for i in range(n_end)]

    # Positions measured from the outer end; flipped for the toe sheet.
    positions = []
    for r in range(rows):
        for x in cols_x:
            positions.append((x, m + r * step))
    for x in end_xs:
        positions.append((x, m))
    positions.sort(key=lambda p: (p[1], p[0]))

    base = ID_BASE[paper] + (0 if sheet == "heel" else 50)
    out = []
    for i, (x, d) in enumerate(positions):
        y = d if sheet == "heel" else H - d - s
        out.append(PlacedMarker(base + i, round(x, 4), round(y, 4)))
    return out


def board(paper: str) -> dict:
    W, H = PAPER[paper]
    sheets = []
    for idx, name in enumerate(("heel", "toe")):
        markers = sheet_layout(paper, name)
        sheets.append(dict(
            name=name, index=idx + 1, origin_mm=[0.0, 0.0 if name == "heel" else H],
            markers={str(mk.id): mk.corners() for mk in markers},
            # 8x8 cells per marker, top row first ("1" = black). Lets the
            # browser's simulated camera draw the real mat without OpenCV.
            bits={str(mk.id): ["".join(map(str, row)) for row in marker_bits(mk.id)] for mk in markers},
        ))
    return dict(
        version=VERSION, dictionary=DICTIONARY, paper=paper, sheet_mm=[W, H],
        marker_mm=MARKER_MM, check_bars=CHECK_BARS, check_tolerance_mm=CHECK_TOLERANCE_MM,
        # Nominal centre of the foot area, in mat coordinates.
        foot_center_mm=[W / 2, H],
        sheets=sheets,
    )


# ---------------------------------------------------------------------------
# Minimal PDF writer (vector only, Helvetica)
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class Page:
    def __init__(self, w_mm: float, h_mm: float):
        self.w, self.h = w_mm, h_mm
        # Scale the coordinate system so all drawing below is in millimetres.
        self.ops = [f"{MM_TO_PT:.9f} 0 0 {MM_TO_PT:.9f} 0 0 cm"]

    def rect(self, x, y, w, h, gray=0.0):
        self.ops.append(f"{gray:.3f} g {x:.4f} {y:.4f} {w:.4f} {h:.4f} re f")

    def cells(self, rects, gray=0.0):
        # One path, one fill: adjacent cells merge without anti-aliasing seams.
        body = " ".join(f"{x:.4f} {y:.4f} {w:.4f} {h:.4f} re" for x, y, w, h in rects)
        self.ops.append(f"{gray:.3f} g {body} f")

    def line(self, x1, y1, x2, y2, width=0.3, gray=0.0, dash=None):
        d = f"[{dash[0]} {dash[1]}] 0 d" if dash else "[] 0 d"
        self.ops.append(f"{gray:.3f} G {width:.3f} w {d} {x1:.4f} {y1:.4f} m {x2:.4f} {y2:.4f} l S")

    def text(self, x, y, size_mm, s, gray=0.0, center=False, bold=False):
        # Rough Helvetica width for centring: ~0.5 em per character.
        if center:
            x -= 0.5 * size_mm * len(s) / 2
        font = "F2" if bold else "F1"
        self.ops.append(f"BT {gray:.3f} g /{font} {size_mm:.3f} Tf {x:.4f} {y:.4f} Td ({_esc(s)}) Tj ET")


def write_pdf(pages: list[Page]) -> bytes:
    objs: list[bytes] = []

    def add(data: bytes) -> int:
        objs.append(data)
        return len(objs)

    add(b"")  # 1 catalog, filled below
    add(b"")  # 2 pages
    f1 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    f2 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    kids = []
    for p in pages:
        stream = zlib.compress("\n".join(p.ops).encode("latin-1"))
        c = add(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(stream) + stream + b"\nendstream")
        w_pt, h_pt = p.w * MM_TO_PT, p.h * MM_TO_PT
        kids.append(add(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w_pt:.4f} {h_pt:.4f}] "
            f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> /Contents {c} 0 R >>".encode()))
    objs[0] = b"<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>"
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>".encode()

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def check_bar_position(paper: str, unit: str = "cm") -> tuple[float, float]:
    """Left end and baseline of a check bar on the heel sheet (sheet mm)."""
    W, H = PAPER[paper]
    bar = next(b for b in CHECK_BARS if b["unit"] == unit)
    top = H - SEAM_CLEAR_MM - 62
    return (W - bar["length_mm"]) / 2, top - (0 if unit == "cm" else 22)


def draw_check_bar(p: "Page", paper: str, bar: dict) -> None:
    """A bar of exactly the stated length, with ticks in its own unit."""
    bx, by = check_bar_position(paper, bar["unit"])
    step = bar["length_mm"] / bar["value"]  # one cm, or one inch
    p.rect(bx, by, bar["length_mm"], 1.8)
    for i in range(int(bar["value"]) + 1):
        x = bx + i * step
        p.rect(x - 0.15, by - 3.6, 0.3, 3.6)
        p.text(x - 0.9, by - 8, 2.8, str(i), gray=0.25)
        if i < bar["value"]:  # half-unit tick
            p.rect(x + step / 2 - 0.12, by - 2.2, 0.24, 2.2)
    p.text(bx + bar["length_mm"] + 3, by - 0.4, 3.0, bar["unit"], bold=True)


def mat_pdf(paper: str) -> bytes:
    W, H = PAPER[paper]
    label = "US Letter" if paper == "letter" else "A4"
    pages = []
    for name in ("heel", "toe"):
        p = Page(W, H)
        cells = []
        for mk in sheet_layout(paper, name):
            c = MARKER_MM / 8
            for r, row in enumerate(marker_bits(mk.id)):
                for col, bit in enumerate(row):
                    if bit:
                        cells.append((mk.x + col * c, mk.y + (7 - r) * c, c, c))
        p.cells(cells)

        cx = W / 2
        seam_y = H if name == "heel" else 0.0
        inward = -1 if name == "heel" else 1
        # Seam guide: where the other sheet's paper edge meets this one.
        p.line(MARGIN_MM + MARKER_MM + GAP_MM, seam_y + inward * 3, W - MARGIN_MM - MARKER_MM - GAP_MM,
               seam_y + inward * 3, width=0.25, gray=0.6, dash=(2, 2))
        sheet_no = 1 if name == "heel" else 2
        title_y = (H - SEAM_CLEAR_MM - 10) if name == "heel" else (SEAM_CLEAR_MM + 4)
        p.text(cx, title_y, 5.0, f"footscan scan mat  -  sheet {sheet_no} of 2", center=True, bold=True)
        p.text(cx, title_y - 7 * (1 if name == "heel" else -1), 3.2,
               f"{label}  -  {'heel end' if name == 'heel' else 'toe end'}", gray=0.35, center=True)
        edge_note = "Tape this edge to sheet 2" if name == "heel" else "Tape this edge to sheet 1"
        p.text(cx, seam_y + inward * 9, 3.0, edge_note, gray=0.45, center=True)

        if name == "heel":
            _, top_y = check_bar_position(paper, "cm")
            p.text(cx, top_y + 8, 3.6, "CHECK YOUR PRINT: measure ONE bar with a ruler", center=True, bold=True)
            for bar in CHECK_BARS:
                draw_check_bar(p, paper, bar)
                _, by = check_bar_position(paper, bar["unit"])
                p.text(cx, by - 12.5, 2.9, f"^ this bar is {bar['label']}", gray=0.3, center=True)
            _, bottom_y = check_bar_position(paper, CHECK_BARS[-1]["unit"])
            p.text(cx, bottom_y - 19, 2.9, "Wrong length? Print again at 100% / Actual size", gray=0.3, center=True)
            p.text(cx, bottom_y - 23.5, 2.9, "(turn OFF 'Fit to page' or 'Scale to fit').", gray=0.3, center=True)
            p.text(cx, MARGIN_MM + MARKER_MM + 30, 3.4, "Heel goes here, toes toward sheet 2", gray=0.45, center=True)
        else:
            p.text(cx, H - MARGIN_MM - MARKER_MM - 30, 3.4, "Toes point this way", gray=0.45, center=True)
        foot_y = MARGIN_MM + MARKER_MM + GAP_MM + 2 if name == "heel" else H - MARGIN_MM - MARKER_MM - GAP_MM - 4.4
        p.text(cx, foot_y, 2.6, "Keep the mat flat and clean. Don't cover the black squares.", gray=0.5, center=True)
        pages.append(p)
    return write_pdf(pages)


STATIC_DIR = Path(__file__).resolve().parents[2] / "web" / "mat"


def static_files() -> dict[str, bytes]:
    """The files the website serves: both papers' PDFs and board definitions."""
    files = {}
    for paper in sorted(PAPER):
        files[f"footscan-mat-{paper}.pdf"] = mat_pdf(paper)
        files[f"footscan-mat-{paper}.json"] = (json.dumps(board(paper), indent=2) + "\n").encode()
    return files


def write_static(directory: Path = STATIC_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for name, data in static_files().items():
        (directory / name).write_bytes(data)
        written.append(directory / name)
    return written
