"""Command line entry point.

    footscan measure scans/*.json -o data/raw/scan_trials.csv
    footscan repeatability data/raw/*.csv -o reports/phase0.md \
        [--target ahi=0.02 --device-condition swb] [--scans-per-device 3]
    footscan serve [--host 0.0.0.0 --https]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from .measures import MEASURES, measure_scan
from .report import SAFETY_BANNER, build_report
from .repeatability import read_rows

FIELDS = ["foot", "condition", "source", "session", "capture_id", "pick", "load_kg", "measure", "value", "scan_id"]


def load_mesh(path: Path):
    import trimesh

    m = trimesh.load(path, force="mesh")
    return m.vertices, m.faces


def cmd_measure(args) -> int:
    rows, n_warn = [], 0
    for p in map(Path, args.scans):
        rec = json.loads(p.read_text())
        mesh = load_mesh(p.parent / rec["mesh"]) if rec.get("mesh") else None
        values, warnings = measure_scan(rec, mesh)
        for w in warnings:
            print(f"[{p.name}] warning: {w}", file=sys.stderr)
            n_warn += 1
        for m in MEASURES:
            rows.append(dict(
                foot=rec["foot"], condition=rec["condition"], source=rec.get("source", "scan"),
                session=rec["session"], capture_id=rec["capture_id"], pick=rec.get("pick", 1),
                load_kg="" if rec.get("load_kg") is None else rec["load_kg"],
                measure=m, value="" if values[m] is None else values[m], scan_id=rec.get("scan_id", p.stem),
            ))
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows from {len(args.scans)} scans to {out} ({n_warn} warnings)")
    return 0


def cmd_repeatability(args) -> int:
    rows = read_rows(args.inputs)
    if not rows:
        print("no measurement rows with values found", file=sys.stderr)
        return 1
    targets = {}
    for t in args.target or []:
        k, _, v = t.partition("=")
        targets[k] = float(v)
    text = build_report(rows, targets, args.device_condition, args.scans_per_device, args.inputs)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(SAFETY_BANNER)
    print(f"\nreport written to {out}")
    return 0


def cmd_mat(args) -> int:
    from .mat import write_static

    for path in write_static():
        print(f"wrote {path}")
    return 0


def cmd_serve(args) -> int:
    from .server import serve

    serve(args.host, args.port, args.https)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="footscan", description="Phase 0 foot measurement tools (not a medical device)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("measure", help="landmark JSON (+ mesh) -> long-format measurement CSV")
    m.add_argument("scans", nargs="+")
    m.add_argument("-o", "--output", required=True)
    m.set_defaults(func=cmd_measure)

    r = sub.add_parser("repeatability", help="measurement CSVs -> repeatability report")
    r.add_argument("inputs", nargs="+")
    r.add_argument("-o", "--output", required=True)
    r.add_argument("--target", action="append", metavar="MEASURE=VALUE",
                   help="intended correction, e.g. ahi=0.02 (repeatable)")
    r.add_argument("--device-condition", help="condition the device would be built from (for --target)")
    r.add_argument("--scans-per-device", type=int, default=1)
    r.set_defaults(func=cmd_repeatability)

    mt = sub.add_parser("mat", help="regenerate the printable scan mat PDFs and board definitions in web/mat/")
    mt.set_defaults(func=cmd_mat)

    sv = sub.add_parser("serve", help="run the local website (capture, library, break-in tracker)")
    sv.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to reach it from your phone")
    sv.add_argument("--port", type=int, default=8765)
    sv.add_argument("--https", action="store_true", help="self-signed HTTPS (phones require it for camera access)")
    sv.set_defaults(func=cmd_serve)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
