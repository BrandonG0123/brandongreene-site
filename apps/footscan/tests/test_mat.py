"""The scan mat is only useful if its printed geometry is exactly what the
board definition says. These tests render the real PDF and detect it."""

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from footscan import mat

cv2 = pytest.importorskip("cv2")
pymupdf = pytest.importorskip("pymupdf")

DPI = 300
PX_PER_MM = DPI / 25.4
NODE_HELPER = Path(__file__).parent / "js" / "detect_markers.cjs"


def render(paper, dpi=DPI):
    doc = pymupdf.open(stream=mat.mat_pdf(paper), filetype="pdf")
    pages = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        pages.append(np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width).copy())
    return doc, pages


def detect_cv(gray):
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_MIP_36h12)
    params = cv2.aruco.DetectorParameters()
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    corners, ids, _ = cv2.aruco.ArucoDetector(d, params).detectMarkers(gray)
    return {} if ids is None else {int(i): c.reshape(4, 2) for i, c in zip(ids.ravel(), corners)}


@pytest.mark.parametrize("paper", ["letter", "a4"])
def test_page_size_is_exact(paper):
    doc, _ = render(paper, dpi=20)
    W, H = mat.PAPER[paper]
    assert len(doc) == 2
    for page in doc:
        assert page.rect.width * 25.4 / 72 == pytest.approx(W, abs=1e-3)
        assert page.rect.height * 25.4 / 72 == pytest.approx(H, abs=1e-3)


@pytest.mark.parametrize("paper", ["letter", "a4"])
def test_board_layout_is_sane(paper):
    b = mat.board(paper)
    W, H = b["sheet_mm"]
    all_ids = [int(i) for s in b["sheets"] for i in s["markers"]]
    assert len(all_ids) == len(set(all_ids)) and len(all_ids) >= 30
    for sheet in b["sheets"]:
        boxes = [np.array(c) for c in sheet["markers"].values()]
        for c in boxes:
            assert c[:, 0].min() >= mat.MARGIN_MM - 1e-6 and c[:, 0].max() <= W - mat.MARGIN_MM + 1e-6
            assert c[:, 1].min() >= mat.MARGIN_MM - 1e-6 and c[:, 1].max() <= H - mat.MARGIN_MM + 1e-6
            assert np.linalg.norm(c[0] - c[1]) == pytest.approx(mat.MARKER_MM)
        # quiet zone: markers never closer than the gap
        for i, a in enumerate(boxes):
            for bb in boxes[i + 1:]:
                sep = max(bb[:, 0].min() - a[:, 0].max(), a[:, 0].min() - bb[:, 0].max(),
                          bb[:, 1].min() - a[:, 1].max(), a[:, 1].min() - bb[:, 1].max())
                assert sep >= mat.GAP_MM - 1e-6


@pytest.mark.parametrize("paper", ["letter", "a4"])
def test_rendered_markers_match_board_definition(paper):
    """Every marker is found with the right ID, within 0.15 mm of where the board says."""
    b = mat.board(paper)
    H = b["sheet_mm"][1]
    _, pages = render(paper)
    worst = 0.0
    for sheet, gray in zip(b["sheets"], pages):
        found = detect_cv(gray)
        assert set(found) == {int(i) for i in sheet["markers"]}
        for mid, corners_mm in sheet["markers"].items():
            expected_px = np.array([[x * PX_PER_MM, (H - y) * PX_PER_MM] for x, y in corners_mm])
            # Pixel centres sit half a pixel in from pixel edges.
            err_mm = np.linalg.norm(found[int(mid)] + 0.5 - expected_px, axis=1) / PX_PER_MM
            worst = max(worst, err_mm.max())
    assert worst < 0.15, f"worst corner error {worst:.3f} mm"


@pytest.mark.parametrize("bar", mat.CHECK_BARS, ids=lambda b: b["unit"])
def test_check_bars_print_at_their_stated_length(bar):
    """The whole point of the bars: a mis-scaled print has to be catchable."""
    paper = "letter"
    _, pages = render(paper)
    _, H = mat.PAPER[paper]
    bx, by = mat.check_bar_position(paper, bar["unit"])
    row = int(round((H - (by + 0.9)) * PX_PER_MM))  # middle of the bar
    dark = np.where(pages[0][row] < 128)[0]
    runs = np.split(dark, np.where(np.diff(dark) > 1)[0] + 1)
    longest = max(runs, key=len)
    assert len(longest) / PX_PER_MM == pytest.approx(bar["length_mm"], abs=0.3)
    assert abs(longest[0] / PX_PER_MM - bx) < 0.3
    # a ruler reading has to be able to tell a good print from "fit to page"
    assert mat.CHECK_TOLERANCE_MM < 0.03 * bar["length_mm"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("paper", ["letter", "a4"])
def test_browser_detector_reads_the_mat(paper, tmp_path):
    """js-aruco2 (used in the browser) finds the same IDs at camera-like resolution."""
    b = mat.board(paper)
    _, pages = render(paper, dpi=100)
    for sheet, gray in zip(b["sheets"], pages):
        raw = tmp_path / f"{sheet['name']}.gray"
        raw.write_bytes(gray.tobytes())
        out = subprocess.run(["node", str(NODE_HELPER), str(raw), str(gray.shape[1]), str(gray.shape[0])],
                             capture_output=True, text=True, check=True)
        ids = {m["id"] for m in json.loads(out.stdout)}
        assert ids == {int(i) for i in sheet["markers"]}


def test_served_mat_files_are_up_to_date():
    """web/mat/ must match the generator; run `footscan mat` after changing the layout."""
    for name, data in mat.static_files().items():
        path = mat.STATIC_DIR / name
        assert path.exists(), f"missing {path}"
        assert path.read_bytes() == data, f"{name} is stale: run `footscan mat`"
