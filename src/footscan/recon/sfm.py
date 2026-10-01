"""COLMAP: where was the phone for each photo, and what is its lens like?

This is "structure from motion" (SfM). It knows nothing about millimetres
yet: its output is a consistent 3-D model at an arbitrary size, position and
orientation. scale.py fixes that afterwards using the mat.

The steps COLMAP runs
---------------------
1. **Features.** In every photo, find SIFT keypoints: small, distinctive
   patches (corners of markers, printed text, speckle, skin creases)
   described in a way that survives changes of viewpoint and lighting.
2. **Matching.** For every pair of photos, pair up keypoints whose
   descriptions agree, then keep only pairs consistent with one rigid camera
   motion (a fundamental matrix or homography fitted with RANSAC: the
   relationship most matches agree on, with the rest thrown out as wrong).
3. **Incremental reconstruction.** Start from the two photos with the best
   matches, triangulate their shared points, then add photos one at a time:
   each new photo's pose is found from the 3-D points it sees (PnP), new
   points are triangulated, and every so often **bundle adjustment**
   re-solves all cameras, the lens and all points together so that every
   point lands, as nearly as possible, exactly where it was seen in every
   photo. The leftover disagreement is the **reprojection error**, in pixels;
   for a good reconstruction it is well under one pixel.

The lens
--------
All frames come from one phone camera, so they share one lens model
(``camera_mode = SINGLE``): a focal length, the image centre and two radial
distortion terms (COLMAP's RADIAL model). Phones correct most distortion in
hardware; the two terms absorb what's left. A single shared lens is also
better constrained than one per photo.

Reproducibility
---------------
Every option that changes the result is set explicitly in ``SfmConfig``
and written into the report with the COLMAP version, and the random seed is
fixed. COLMAP uses RANSAC (random sampling) in several places; with the
seed fixed and threads limited to one where order matters, the same photos
give the same model. The tests check that by running twice.
"""

from __future__ import annotations

import shutil
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class SfmConfig:
    camera_model: str = "RADIAL"
    max_image_size: int = 3200       # SIFT on full-size frames (phone video frames are <= 1920)
    max_num_features: int = 8192
    match_max_ratio: float = 0.8     # Lowe's ratio test: best match must clearly beat the runner-up
    match_cross_check: bool = True   # keep a match only if each keypoint picks the other
    min_num_matches: int = 15
    seed: int = 1
    num_threads: int = 1             # one thread: same input -> same output
    # The lens centre is rarely exactly mid-image. With photos from all round
    # (and the phone at varying tilts) it is well determined, and leaving it
    # fixed at the middle biased camera positions by ~2 mm on test scenes.
    # The report flags a centre that wanders implausibly far.
    refine_principal_point: bool = True


class SfmError(RuntimeError):
    pass


@dataclass
class SfmResult:
    reconstruction: object          # pycolmap.Reconstruction (the largest model)
    path: Path
    report: dict


def run(image_dir: Path, names: list[str], work: Path, config: SfmConfig = SfmConfig(), log=print) -> SfmResult:
    import pycolmap

    work = Path(work)
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    db = work / "database.db"
    pycolmap.set_random_seed(config.seed)

    t0 = time.time()
    reader = pycolmap.ImageReaderOptions()
    reader.camera_model = config.camera_model
    extraction = pycolmap.FeatureExtractionOptions()
    extraction.max_image_size = config.max_image_size
    extraction.num_threads = config.num_threads
    extraction.use_gpu = False
    extraction.sift.max_num_features = config.max_num_features
    log(f"COLMAP {pycolmap.__version__}: finding features in {len(names)} photos")
    pycolmap.extract_features(db, image_dir, image_names=names, camera_mode=pycolmap.CameraMode.SINGLE,
                              reader_options=reader, extraction_options=extraction, device=pycolmap.Device.cpu)

    matching = pycolmap.FeatureMatchingOptions()
    matching.num_threads = config.num_threads
    matching.use_gpu = False
    matching.sift.max_ratio = config.match_max_ratio
    matching.sift.cross_check = config.match_cross_check
    log("COLMAP: matching every pair of photos")
    pycolmap.match_exhaustive(db, matching_options=matching, device=pycolmap.Device.cpu)

    options = pycolmap.IncrementalPipelineOptions()
    options.random_seed = config.seed
    options.num_threads = config.num_threads
    options.min_num_matches = config.min_num_matches
    options.multiple_models = False
    options.ba_refine_principal_point = config.refine_principal_point
    log("COLMAP: solving camera positions (bundle adjustment)")
    sparse = work / "sparse"
    sparse.mkdir()
    models = pycolmap.incremental_mapping(db, image_dir, sparse, options=options)
    if not models:
        raise SfmError("COLMAP could not connect the photos into one model. Usually: too few photos, "
                       "too much blur, or the camera moved too far between photos.")
    best_id = max(models, key=lambda k: models[k].num_reg_images())
    rec = models[best_id]
    model_dir = sparse / str(best_id)
    cam = next(iter(rec.cameras.values()))
    registered = sorted(img.name for img in rec.images.values())
    pp = np.array([cam.principal_point_x, cam.principal_point_y])
    pp_offset = (pp - [cam.width / 2, cam.height / 2]) / max(cam.width, cam.height)
    warnings = []
    if np.abs(pp_offset).max() > 0.05:
        warnings.append(f"lens centre solved {100 * np.abs(pp_offset).max():.1f}% of the image away from the middle; "
                        "that is unusual for a phone and suggests the photos don't constrain the lens well")
    report = dict(
        colmap_version=pycolmap.__version__,
        config=asdict(config),
        photos=len(names),
        registered=len(registered),
        unregistered=sorted(set(names) - set(registered)),
        points=rec.num_points3D(),
        mean_reprojection_error_px=round(float(rec.compute_mean_reprojection_error()), 4),
        mean_track_length=round(float(rec.compute_mean_track_length()), 2),
        camera=dict(model=cam.model_name if hasattr(cam, "model_name") else str(cam.model),
                    width=cam.width, height=cam.height, params=[float(v) for v in cam.params]),
        seconds=round(time.time() - t0, 1),
        warnings=warnings,
    )
    log(f"COLMAP: {report['registered']}/{len(names)} photos placed, reprojection error "
        f"{report['mean_reprojection_error_px']} px")
    return SfmResult(rec, model_dir, report)


def poses(rec) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """World->camera (R, t) per registered photo name, in the model's own units."""
    out = {}
    for img in rec.images.values():
        if not img.has_pose:
            continue
        T = img.cam_from_world()
        m = T.matrix()
        out[img.name] = (np.asarray(m[:, :3], float), np.asarray(m[:, 3], float))
    return out
