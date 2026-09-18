"""Local web server: the scan site, the operator studio, and on-disk storage.

Standard library only. It runs on your own machine (and your own Wi-Fi, so a
phone can reach it). It is not hardened for the open internet.

Two audiences
-------------
**The person being fitted** uses ``/`` on their phone: acknowledge the safety
terms, scan each foot, send. They can create a submission and upload to it
with the one-time upload token they were given, and nothing else. They cannot
list or view anyone's scans, including their own after sending.

**The operator** uses ``/studio/``. Studio pages and every API that reads
scans answer only requests from this machine (loopback) or from a browser
holding the studio key, so someone on the same Wi-Fi cannot browse other
people's foot photos. To use the studio from your own phone, open the
``/studio/?key=...`` address printed at startup once; it sets a cookie.

Customer API
------------
GET  /api/survey                                        question schema
POST /api/survey/evaluate                               {feet, survey} -> {blocked, flags, plan}; stores nothing
POST /api/submissions                                   {name, feet, acknowledgments, survey}
                                                        -> {id, upload_token, plan, flags}; 422 if screened out
POST /api/submissions/<id>/scans/<key>/start            clear a scan before (re)scanning; key e.g. right-swb
PUT  /api/submissions/<id>/scans/<key>/frames/<n>       one JPEG, header X-Upload-Token
POST /api/submissions/<id>/scans/<key>/complete         per-frame quality data
POST /api/submissions/<id>/submit                       closes uploads

Operator API (this machine, or a browser holding the studio key)
--------------------------------
GET  /api/submissions                                   list
GET  /api/submissions/<id>                              detail
GET  /api/submissions/<id>/scans/<foot>/frames/<n>.jpg
POST /api/submissions/<id>/status                       {status, note}
GET/POST/PUT /api/captures...                           research captures (Phase 0)
GET  /api/studio                                        scan address to share

Phones only allow camera and motion-sensor access on secure origins, so
``--https`` generates a self-signed certificate.
"""

from __future__ import annotations

import datetime as dt
import hmac
import http.cookies
import json
import mimetypes
import re
import secrets
import shutil
import socket
import ssl
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import survey as survey_mod

ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"

# "object" is a scanner test: any object, no mat, no foot. It can't be scaled
# to millimetres, so it never counts as foot measurement data.
CONDITIONS = {"nwb", "nwb_relaxed", "swb", "fwb", "object"}
UNSCALED_CONDITIONS = {"object"}
METHODS = {"bare_skin", "speckle_sock", "marker_dots", "foam_impression"}
FEET = ("left", "right")
REQUIRED_ACKS = ("not_medical_device", "clinician_review", "break_in", "photo_consent")
OPERATOR_STATUSES = {"received", "needs_rescan", "archived"}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,20}$")
MAX_FRAME_BYTES = 15 * 1024 * 1024
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_FRAMES = 500
LOOPBACK = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}


class BadRequest(Exception):
    pass


class Forbidden(Exception):
    pass


class ScreenedOut(Exception):
    def __init__(self, blocked: dict):
        super().__init__(blocked["message"])
        self.blocked = blocked


def now_iso() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def write_json(path: Path, obj: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2))
    tmp.replace(path)


# ---- validation ------------------------------------------------------------

def validate_setup(body: dict) -> dict:
    """Research capture setup (Phase 0 studio)."""
    foot = body.get("foot")
    cond = body.get("condition")
    session = str(body.get("session", "")).strip()
    method = body.get("method", "bare_skin")
    if cond not in CONDITIONS:
        raise BadRequest(f"condition must be one of {sorted(CONDITIONS)}")
    is_object = cond in UNSCALED_CONDITIONS
    if is_object:
        foot = foot if foot in FEET else None
    elif foot not in FEET:
        raise BadRequest("foot must be left or right")
    if not SESSION_RE.match(session):
        raise BadRequest("session: 1-20 letters, digits, - or _")
    if method not in METHODS:
        raise BadRequest(f"method must be one of {sorted(METHODS)}")
    load = parse_load(body.get("load_kg"))
    if cond in ("swb", "fwb") and load is None:
        raise BadRequest("weight-bearing captures need the scale reading (load_kg)")
    return dict(
        foot=foot, condition=cond, session=session, method=method, load_kg=load,
        measurable=not is_object,
        notes=str(body.get("notes", ""))[:2000], device=str(body.get("device", ""))[:300],
    )


def parse_load(value) -> float | None:
    if value in ("", None):
        return None
    load = float(value)
    if not 0 < load < 400:
        raise BadRequest("load_kg out of range")
    return load


def validate_feet(feet) -> list[str]:
    if not isinstance(feet, list) or not feet or len(set(feet)) != len(feet) or not set(feet) <= set(FEET):
        raise BadRequest("feet: choose left, right, or both")
    return [f for f in FEET if f in feet]


def evaluate_survey(body: dict) -> tuple[list[str], dict, dict]:
    """-> (feet, cleaned survey, evaluation). Raises BadRequest on invalid answers."""
    feet = validate_feet(body.get("feet"))
    answers = survey_mod.validate(body.get("survey"))
    return feet, answers, survey_mod.evaluate(answers, feet)


def validate_submission(body: dict) -> dict:
    name = str(body.get("name", "")).strip()
    if not 1 <= len(name) <= 80:
        raise BadRequest("name: 1-80 characters")
    acks = body.get("acknowledgments") or {}
    missing = [k for k in REQUIRED_ACKS if acks.get(k) is not True]
    if missing:
        raise BadRequest(f"all acknowledgments are required (missing {missing})")
    try:
        mat_check = float(body.get("mat_check_mm"))
    except (TypeError, ValueError):
        raise BadRequest("mat_check_mm: measure the 100 mm bar on the printed scan mat") from None
    # Fit-to-page scaling is typically 3-6 %; ruler reading error is about 0.5 mm.
    if abs(mat_check - 100) > 1:
        raise BadRequest("mat_check_mm: the scan mat was printed at the wrong size; print at 100% / actual size")
    feet, answers, evaluation = evaluate_survey(body)
    if evaluation["blocked"]:
        # Screened out: refuse, and store nothing about this person.
        raise ScreenedOut(evaluation["blocked"])
    return dict(
        name=name, feet=feet, survey=answers, flags=evaluation["flags"], plan=evaluation["plan"], mat_check_mm=mat_check,
        acknowledgments={k: True for k in REQUIRED_ACKS}, device=str(body.get("device", ""))[:300],
    )


def new_id(prefix: str, data_dir: Path) -> str:
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    while True:
        cid = f"{prefix}{stamp}-{secrets.token_hex(2)}"
        if not (data_dir / cid).exists():
            return cid


# ---- handler ---------------------------------------------------------------

def is_loopback(handler) -> bool:
    return handler.client_address[0] in LOOPBACK


def load_studio_key(path: Path) -> str:
    """A persistent random key, so a phone stays signed in across restarts."""
    if path.exists() and (key := path.read_text().strip()):
        return key
    key = secrets.token_urlsafe(18)
    path.write_text(key)
    path.chmod(0o600)
    return key


def make_handler(web_dir: Path = WEB_DIR, data_dir: Path = DATA_DIR, local_check=is_loopback,
                 studio_key: str | None = None, secure_cookie: bool = False):
    captures_dir = data_dir / "captures"
    submissions_dir = data_dir / "submissions"

    class Handler(BaseHTTPRequestHandler):
        server_version = "footscan"

        def log_message(self, fmt, *args):  # skip static asset noise
            if args and "/api/" in str(args[0]):
                super().log_message(fmt, *args)

        # -- helpers --------------------------------------------------------
        def send_json(self, obj, status=HTTPStatus.OK):
            data = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def send_file(self, path: Path, ctype: str, cache: str = "no-cache"):
            data = path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", cache)
            self.end_headers()
            self.wfile.write(data)

        def read_body(self, limit: int) -> bytes:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                raise BadRequest("empty body")
            if length > limit:
                raise BadRequest("body too large")
            return self.rfile.read(length)

        def json_body(self) -> dict:
            body = json.loads(self.read_body(MAX_JSON_BYTES))
            if not isinstance(body, dict):
                raise BadRequest("expected a JSON object")
            return body

        def has_studio_cookie(self) -> bool:
            if not studio_key:
                return False
            jar = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
            got = jar.get("footscan_studio")
            return bool(got) and hmac.compare_digest(got.value, studio_key)

        def require_local(self):
            if not (local_check(self) or self.has_studio_cookie()):
                raise Forbidden("studio is only available to the operator")

        def studio_login(self, path: str, query: str) -> bool:
            """``/studio/?key=...``: set the cookie and redirect to a clean URL."""
            params = dict(q.split("=", 1) for q in query.split("&") if "=" in q)
            key = params.get("key")
            if not (studio_key and key and hmac.compare_digest(key, studio_key)):
                return False
            flags = "; Secure" if secure_cookie else ""
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Set-Cookie", f"footscan_studio={studio_key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000{flags}")
            self.send_header("Location", path)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return True

        def save_jpeg(self, path: Path, n: int):
            if not 1 <= n <= MAX_FRAMES:
                raise BadRequest("frame number out of range")
            body = self.read_body(MAX_FRAME_BYTES)
            if body[:3] != b"\xff\xd8\xff":
                raise BadRequest("frame must be a JPEG")
            path.write_bytes(body)

        def route(self, method: str):
            path, _, query = self.path.partition("?")
            try:
                if path.startswith("/api/"):
                    return self.api(method, path.strip("/").split("/")[1:])
                if method != "GET":
                    return self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)
                if path == "/studio" or path.startswith("/studio/"):
                    if query and self.studio_login(path, query):
                        return
                    self.require_local()
                return self.static(path)
            except BadRequest as e:
                self.send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)
            except Forbidden as e:
                self.send_json({"error": str(e)}, HTTPStatus.FORBIDDEN)
            except survey_mod.SurveyError as e:
                self.send_json({"error": "survey incomplete or invalid", "fields": e.errors}, HTTPStatus.BAD_REQUEST)
            except ScreenedOut as e:
                self.send_json({"error": str(e), "blocked": e.blocked}, HTTPStatus.UNPROCESSABLE_ENTITY)
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json({"error": f"invalid input: {e}"}, HTTPStatus.BAD_REQUEST)
            except FileNotFoundError:
                self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def static(self, path: str):
            rel = path.lstrip("/") or "index.html"
            target = (web_dir / rel).resolve()
            if target.is_dir():
                target = target / "index.html"
            if not target.is_relative_to(web_dir.resolve()) or not target.is_file():
                return self.send_error(HTTPStatus.NOT_FOUND)
            ctype = "text/javascript" if target.suffix == ".js" else (
                mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_file(target, ctype)

        def api(self, method: str, parts: list[str]):
            if parts[:1] == ["submissions"]:
                return self.api_submissions(method, parts[1:])
            if parts == ["survey"] and method == "GET":
                return self.send_json({"sections": survey_mod.SECTIONS})
            if parts == ["survey", "evaluate"] and method == "POST":
                _, _, evaluation = evaluate_survey(self.json_body())
                return self.send_json(evaluation)
            if parts[:1] == ["captures"]:
                self.require_local()
                return self.api_captures(method, parts[1:])
            if parts == ["studio"] and method == "GET":
                self.require_local()
                return self.send_json(self.studio_info())
            raise FileNotFoundError

        def studio_info(self) -> dict:
            host, port = self.server.server_address[:2]
            scheme = "https" if secure_cookie else "http"
            reachable = host not in ("127.0.0.1", "localhost", "::1")
            ip = lan_ip() if host in ("0.0.0.0", "::") else host
            return dict(
                scan_url=f"{scheme}://{ip}:{port}/" if reachable and ip else None,
                https=secure_cookie,
                phones_can_connect=reachable and secure_cookie,
            )

        # -- customer submissions ------------------------------------------
        def submission(self, sid: str) -> tuple[Path, dict]:
            if not ID_RE.match(sid):
                raise BadRequest("bad submission id")
            d = submissions_dir / sid
            if not (d / "submission.json").exists():
                raise FileNotFoundError
            return d, read_json(d / "submission.json")

        def require_token(self, meta: dict):
            token = self.headers.get("X-Upload-Token", "")
            expected = meta.get("upload_token")
            if not expected or not hmac.compare_digest(token, expected):
                raise Forbidden("upload closed or invalid upload token")

        def api_submissions(self, method: str, p: list[str]):
            if not p:
                if method == "POST":
                    info = validate_submission(self.json_body())
                    submissions_dir.mkdir(parents=True, exist_ok=True)
                    sid = new_id("sub-", submissions_dir)
                    (submissions_dir / sid).mkdir()
                    token = secrets.token_urlsafe(24)
                    meta = dict(
                        id=sid, created=now_iso(), status="uploading",
                        history=[dict(at=now_iso(), status="uploading", note="submission started")],
                        acknowledged_at=now_iso(), upload_token=token,
                        scans={p["key"]: dict(foot=p["foot"], condition=p["condition"], label=p["label"], status="pending")
                               for p in info["plan"]},
                        **info,
                    )
                    write_json(submissions_dir / sid / "submission.json", meta)
                    return self.send_json({"id": sid, "upload_token": token, "plan": info["plan"], "flags": info["flags"]},
                                          HTTPStatus.CREATED)
                if method == "GET":
                    self.require_local()
                    return self.send_json(list_submissions(submissions_dir))
                raise FileNotFoundError

            d, meta = self.submission(p[0])
            rest = p[1:]

            if rest == [] and method == "GET":
                self.require_local()
                return self.send_json(public_meta(meta))

            if rest == ["status"] and method == "POST":
                self.require_local()
                body = self.json_body()
                status = body.get("status")
                if status not in OPERATOR_STATUSES:
                    raise BadRequest(f"status must be one of {sorted(OPERATOR_STATUSES)}")
                meta["status"] = status
                meta["history"].append(dict(at=now_iso(), status=status, note=str(body.get("note", ""))[:1000]))
                write_json(d / "submission.json", meta)
                return self.send_json(public_meta(meta))

            if rest == ["submit"] and method == "POST":
                self.require_token(meta)
                incomplete = [f for f, s in meta["scans"].items() if s.get("status") != "complete"]
                if incomplete:
                    raise BadRequest(f"scan not finished for: {', '.join(incomplete)}")
                meta.update(status="received", submitted=now_iso(), upload_token=None)
                meta["history"].append(dict(at=now_iso(), status="received", note="sent by customer"))
                write_json(d / "submission.json", meta)
                return self.send_json({"ok": True})

            if len(rest) >= 3 and rest[0] == "scans":
                key = rest[1]
                if key not in meta["scans"]:
                    raise FileNotFoundError
                scan_dir = d / key
                ident = {k: meta["scans"][key][k] for k in ("foot", "condition", "label")}
                if rest[2] == "start" and len(rest) == 3 and method == "POST":
                    self.require_token(meta)
                    shutil.rmtree(scan_dir, ignore_errors=True)
                    scan_dir.mkdir()
                    meta["scans"][key] = dict(**ident, status="scanning", started=now_iso())
                    write_json(d / "submission.json", meta)
                    return self.send_json({"ok": True})
                if rest[2] == "frames" and len(rest) == 4:
                    if method == "PUT":
                        self.require_token(meta)
                        if not scan_dir.is_dir():
                            raise BadRequest("call start before uploading frames")
                        n = int(rest[3])
                        self.save_jpeg(scan_dir / f"frame_{n:04d}.jpg", n)
                        return self.send_json({"ok": True})
                    if method == "GET" and rest[3].endswith(".jpg"):
                        self.require_local()
                        f = scan_dir / f"frame_{int(rest[3][:-4]):04d}.jpg"
                        if not f.is_file():
                            raise FileNotFoundError
                        return self.send_file(f, "image/jpeg")
                if rest[2] == "complete" and len(rest) == 3 and method == "POST":
                    self.require_token(meta)
                    body = self.json_body()
                    frames = body.get("frames", [])
                    if not isinstance(frames, list) or len(frames) > MAX_FRAMES:
                        raise BadRequest("frames must be a list")
                    files = sorted(x.name for x in scan_dir.glob("frame_*.jpg"))
                    if not files:
                        raise BadRequest("no frames uploaded")
                    meta["scans"][key] = dict(
                        **ident, status="complete", completed=now_iso(), frame_files=files, frames=frames,
                        summary=body.get("summary", {}), load_kg=parse_load(body.get("load_kg")),
                    )
                    write_json(d / "submission.json", meta)
                    return self.send_json({"ok": True, "frames_on_disk": len(files)})
            raise FileNotFoundError

        # -- research captures (operator only) -----------------------------
        def api_captures(self, method: str, p: list[str]):
            if not p and method == "GET":
                return self.send_json(list_captures(captures_dir))
            if not p and method == "POST":
                setup = validate_setup(self.json_body())
                captures_dir.mkdir(parents=True, exist_ok=True)
                tag = setup["foot"][0].upper() if setup["foot"] else "X"
                cid = new_id(f"{setup['session']}_{setup['condition']}_{tag}_", captures_dir)
                (captures_dir / cid).mkdir()
                write_json(captures_dir / cid / "capture.json",
                           dict(capture_id=cid, created=now_iso(), status="uploading", frames=[], **setup))
                return self.send_json({"id": cid}, HTTPStatus.CREATED)
            if not p or not ID_RE.match(p[0]):
                raise BadRequest("bad capture id")
            d = captures_dir / p[0]
            if not (d / "capture.json").exists():
                raise FileNotFoundError
            if len(p) == 3 and p[1] == "frames":
                if method == "PUT":
                    n = int(p[2])
                    self.save_jpeg(d / f"frame_{n:04d}.jpg", n)
                    return self.send_json({"ok": True})
                if method == "GET" and p[2].endswith(".jpg"):
                    f = d / f"frame_{int(p[2][:-4]):04d}.jpg"
                    if not f.is_file():
                        raise FileNotFoundError
                    return self.send_file(f, "image/jpeg")
            if p[1:] == ["complete"] and method == "POST":
                body = self.json_body()
                frames = body.get("frames", [])
                if not isinstance(frames, list) or len(frames) > MAX_FRAMES:
                    raise BadRequest("frames must be a list")
                meta = read_json(d / "capture.json")
                files = sorted(x.name for x in d.glob("frame_*.jpg"))
                meta.update(status="complete", frames=frames, frame_files=files, summary=body.get("summary", {}))
                write_json(d / "capture.json", meta)
                return self.send_json({"ok": True, "frames_on_disk": len(files)})
            raise FileNotFoundError

        def do_GET(self):
            self.route("GET")

        def do_POST(self):
            self.route("POST")

        def do_PUT(self):
            self.route("PUT")

    return Handler


def public_meta(meta: dict) -> dict:
    """Submission as the studio sees it: never includes the upload token."""
    out = {k: v for k, v in meta.items() if k != "upload_token"}
    out["scans"] = {f: {k: v for k, v in s.items() if k != "frames"} for f, s in meta.get("scans", {}).items()}
    return out


def list_submissions(submissions_dir: Path) -> list[dict]:
    out = []
    for f in submissions_dir.glob("*/submission.json") if submissions_dir.exists() else []:
        try:
            out.append(public_meta(read_json(f)))
        except json.JSONDecodeError:
            continue
    return sorted(out, key=lambda m: m.get("created", ""), reverse=True)


def list_captures(captures_dir: Path) -> list[dict]:
    out = []
    for f in captures_dir.glob("*/capture.json") if captures_dir.exists() else []:
        try:
            meta = read_json(f)
        except json.JSONDecodeError:
            continue
        meta.pop("frames", None)
        out.append(meta)
    return sorted(out, key=lambda m: m.get("created", ""), reverse=True)


def ensure_cert(cert_dir: Path) -> tuple[Path, Path]:
    cert, key = cert_dir / "cert.pem", cert_dir / "key.pem"
    if not cert.exists():
        cert_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
             "-keyout", str(key), "-out", str(cert), "-subj", "/CN=footscan-local"],
            check=True, capture_output=True,
        )
    return cert, key


def lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def serve(host: str = "127.0.0.1", port: int = 8765, https: bool = False) -> None:
    key = load_studio_key(ROOT / ".studio_key")
    httpd = ThreadingHTTPServer((host, port), make_handler(studio_key=key, secure_cookie=https))
    scheme = "http"
    if https:
        cert, key = ensure_cert(ROOT / ".certs")
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"
    print("footscan - NOT a medical device")
    print(f"studio on this computer: {scheme}://localhost:{port}/studio/")
    if host == "0.0.0.0" and (ip := lan_ip()):
        print(f"scan page for phones on this Wi-Fi: {scheme}://{ip}:{port}/")
        print(f"studio on YOUR phone (keep this private): {scheme}://{ip}:{port}/studio/?key={key}")
    else:
        print(f"scan page: {scheme}://localhost:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
