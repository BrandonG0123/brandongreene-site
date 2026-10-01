"""Phase 2: photos of a foot (or a test object) on the scan mat -> a mesh in millimetres.

Not a medical device. See docs/SAFETY.md and docs/phase2-reconstruction.md.

    calib     the printed calibration object (reference shape for the accuracy study)
    markers   finding the mat's markers in each photo, with sub-pixel corners
    sfm       COLMAP: where each photo was taken from, and the camera's lens
    scale     turning COLMAP's unitless model into millimetres using the mat
    dense     a depth for every pixel (COLMAP's own step needs an NVIDIA GPU)
    mesh      points -> a clean surface
    accuracy  scan vs. the calibration object, as numbers
    plantar   the underside of the foot, in the foot's own coordinate frame
    pipeline  runs the steps above and writes recon/report.json
"""
