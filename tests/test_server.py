import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from footscan.server import WEB_DIR, make_handler

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
KEY = "test-studio-key"
ACKS = {"not_medical_device": True, "clinician_review": True, "break_in": True, "photo_consent": True}
SURVEY = {
    "adult": "yes", "conditions": ["none"], "pain": "none", "arch": "flat", "tiptoe": "appears", "arch_change": "no",
    "use": "sport", "sport": "tennis", "sport_level": "competitive", "shoe_type": "court",
    "removable_insole": "yes", "current_insoles": "none", "goals": ["support", "stability"],
}
PERSON = {"name": "Test Person", "feet": ["right", "left"], "acknowledgments": ACKS, "survey": SURVEY, "mat_check_mm": 100}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def start(tmp_path, local: bool):
    handler = make_handler(WEB_DIR, tmp_path, local_check=lambda h: local, studio_key=KEY)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


@pytest.fixture
def servers(tmp_path):
    """Same data dir, two views: the operator's machine and a phone on the Wi-Fi."""
    op, op_url = start(tmp_path, local=True)
    ph, ph_url = start(tmp_path, local=False)
    yield op_url, ph_url, tmp_path
    op.shutdown()
    ph.shutdown()


def call(url, method="GET", body=None, headers=None, opener=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    data = json.dumps(body).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with (opener or urllib.request.build_opener()).open(req) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def body(resp):
    return json.loads(resp[1])


def test_customer_flow_end_to_end(servers):
    op, phone, data = servers
    status, raw, _ = call(f"{phone}/api/submissions", "POST", PERSON)
    assert status == 201
    sub = json.loads(raw)
    tok = {"X-Upload-Token": sub["upload_token"]}
    keys = [p["key"] for p in sub["plan"]]
    assert keys == ["right-swb", "left-swb", "right-fwb", "left-fwb"]  # flat foot -> standing scans too

    # can't send before every planned scan is done
    assert call(f"{phone}/api/submissions/{sub['id']}/submit", "POST", {}, tok)[0] == 400

    for key in keys:
        base = f"{phone}/api/submissions/{sub['id']}/scans/{key}"
        assert call(f"{base}/start", "POST", {}, tok)[0] == 200
        for n in (1, 2, 3):
            assert call(f"{base}/frames/{n}", "PUT", JPEG, {**tok, "Content-Type": "image/jpeg"})[0] == 200
        assert call(f"{base}/complete", "POST", {"frames": [], "summary": {"frames_kept": 3}, "load_kg": "9.5"}, tok)[0] == 200

    assert call(f"{phone}/api/submissions/{sub['id']}/submit", "POST", {}, tok)[0] == 200
    # upload token is closed after sending
    assert call(f"{phone}/api/submissions/{sub['id']}/scans/right-swb/start", "POST", {}, tok)[0] == 403
    # scans outside the plan don't exist
    assert call(f"{phone}/api/submissions/{sub['id']}/scans/right-nwb/start", "POST", {}, tok)[0] == 404

    listing = body(call(f"{op}/api/submissions"))
    assert listing[0]["id"] == sub["id"] and listing[0]["status"] == "received"
    assert "upload_token" not in listing[0]
    detail = body(call(f"{op}/api/submissions/{sub['id']}"))
    assert detail["scans"]["right-swb"]["frame_files"] == ["frame_0001.jpg", "frame_0002.jpg", "frame_0003.jpg"]
    assert detail["scans"]["left-fwb"]["load_kg"] == 9.5 and detail["scans"]["left-fwb"]["condition"] == "fwb"
    assert detail["survey"]["sport"] == "tennis"
    assert [f["code"] for f in detail["flags"]] == ["tiptoe_arch"]
    status, img, _ = call(f"{op}/api/submissions/{sub['id']}/scans/left-swb/frames/2.jpg")
    assert status == 200 and img == JPEG

    updated = body(call(f"{op}/api/submissions/{sub['id']}/status", "POST", {"status": "needs_rescan", "note": "blurry heel"}))
    assert updated["status"] == "needs_rescan" and updated["history"][-1]["note"] == "blurry heel"


def test_restarting_a_foot_clears_old_frames(servers):
    _, phone, data = servers
    sub = body(call(f"{phone}/api/submissions", "POST", {**PERSON, "feet": ["right"]}))
    tok = {"X-Upload-Token": sub["upload_token"]}
    base = f"{phone}/api/submissions/{sub['id']}/scans/right-swb"
    call(f"{base}/start", "POST", {}, tok)
    for n in (1, 2, 3):
        call(f"{base}/frames/{n}", "PUT", JPEG, {**tok, "Content-Type": "image/jpeg"})
    call(f"{base}/start", "POST", {}, tok)
    call(f"{base}/frames/1", "PUT", JPEG, {**tok, "Content-Type": "image/jpeg"})
    assert body(call(f"{base}/complete", "POST", {"frames": []}, tok))["frames_on_disk"] == 1


@pytest.mark.parametrize("patch,msg", [
    ({"acknowledgments": {**ACKS, "clinician_review": False}}, "acknowledgments"),
    ({"acknowledgments": {}}, "acknowledgments"),
    ({"name": "  "}, "name"),
    ({"feet": []}, "feet"),
    ({"feet": ["right", "right"]}, "feet"),
    ({"feet": ["middle"]}, "feet"),
    ({"mat_check_mm": None}, "mat_check_mm"),
    ({"mat_check_mm": 96.5}, "wrong size"),
])
def test_submission_validation(servers, patch, msg):
    _, phone, _ = servers
    status, raw, _ = call(f"{phone}/api/submissions", "POST", {**PERSON, **patch})
    assert status == 400 and msg in json.loads(raw)["error"]


def test_phone_cannot_see_studio_or_other_scans(servers):
    op, phone, _ = servers
    sub = body(call(f"{phone}/api/submissions", "POST", PERSON))
    assert call(f"{phone}/api/submissions")[0] == 403
    assert call(f"{phone}/api/submissions/{sub['id']}")[0] == 403
    assert call(f"{phone}/api/submissions/{sub['id']}/status", "POST", {"status": "archived"})[0] == 403
    assert call(f"{phone}/api/captures")[0] == 403
    assert call(f"{phone}/api/studio")[0] == 403
    assert call(f"{phone}/studio/")[0] == 403
    assert call(f"{phone}/studio/submission.html")[0] == 403
    # wrong or missing upload token
    assert call(f"{phone}/api/submissions/{sub['id']}/scans/right-swb/start", "POST", {}, {"X-Upload-Token": "nope"})[0] == 403
    assert call(f"{phone}/api/submissions/{sub['id']}/scans/right-swb/start", "POST", {})[0] == 403
    # the customer pages themselves are public
    assert call(f"{phone}/")[0] == 200
    assert call(f"{phone}/care.html")[0] == 200


def test_survey_endpoints_and_screening(servers):
    _, phone, data = servers
    schema = body(call(f"{phone}/api/survey"))
    assert [s["id"] for s in schema["sections"]] == ["safety", "feet", "use"]

    plan = body(call(f"{phone}/api/survey/evaluate", "POST", {"feet": ["left"], "survey": SURVEY}))
    assert [p["key"] for p in plan["plan"]] == ["left-swb", "left-fwb"]
    assert not (data / "submissions").exists()  # evaluating stores nothing

    status, raw, _ = call(f"{phone}/api/survey/evaluate", "POST", {"feet": ["left"], "survey": {**SURVEY, "use": "sport", "sport": ""}})
    assert status == 400 and "sport" in json.loads(raw)["fields"]

    screened = {**PERSON, "survey": {**SURVEY, "conditions": ["diabetes"]}}
    status, raw, _ = call(f"{phone}/api/submissions", "POST", screened)
    assert status == 422 and "podiatrist" in json.loads(raw)["blocked"]["message"]
    assert not any((data / "submissions").glob("*")) if (data / "submissions").exists() else True


def test_studio_key_login_from_phone(servers):
    _, phone, _ = servers
    opener = urllib.request.build_opener(NoRedirect)
    assert call(f"{phone}/studio/?key=wrong", opener=opener)[0] == 403
    status, _, headers = call(f"{phone}/studio/?key={KEY}", opener=opener)
    assert status == 303 and headers["Location"] == "/studio/"
    cookie = headers["Set-Cookie"].split(";")[0]
    assert "HttpOnly" in headers["Set-Cookie"]
    assert call(f"{phone}/studio/", headers={"Cookie": cookie})[0] == 200
    assert call(f"{phone}/api/submissions", headers={"Cookie": cookie})[0] == 200
    assert call(f"{phone}/api/submissions", headers={"Cookie": "footscan_studio=wrong"})[0] == 403


def test_research_capture_roundtrip(servers):
    op, _, data = servers
    setup = {"foot": "right", "condition": "fwb", "session": "S1", "load_kg": 38.5, "method": "bare_skin"}
    status, raw, _ = call(f"{op}/api/captures", "POST", setup)
    assert status == 201
    cid = json.loads(raw)["id"]
    assert call(f"{op}/api/captures/{cid}/frames/1", "PUT", JPEG, {"Content-Type": "image/jpeg"})[0] == 200
    assert call(f"{op}/api/captures/{cid}/frames/2", "PUT", b"not a jpeg", {"Content-Type": "image/jpeg"})[0] == 400
    assert call(f"{op}/api/captures/{cid}/complete", "POST", {"frames": []})[0] == 200
    meta = json.loads((data / "captures" / cid / "capture.json").read_text())
    assert meta["status"] == "complete" and meta["frame_files"] == ["frame_0001.jpg"]
    assert call(f"{op}/api/captures", "POST", {**setup, "load_kg": None})[0] == 400


def test_object_capture_needs_no_foot_mat_or_load(servers):
    """Scanner test captures: any object, no mat, marked unmeasurable."""
    op, _, data = servers
    status, raw, _ = call(f"{op}/api/captures", "POST",
                          {"condition": "object", "session": "MATTEST", "notes": "shoe on a desk"})
    assert status == 201
    cid = json.loads(raw)["id"]
    meta = json.loads((data / "captures" / cid / "capture.json").read_text())
    assert meta["foot"] is None and meta["measurable"] is False and meta["load_kg"] is None
    # foot conditions still demand a foot, and weight-bearing still demands the scale reading
    assert call(f"{op}/api/captures", "POST", {"condition": "swb", "session": "S1", "load_kg": 9})[0] == 400
    assert call(f"{op}/api/captures", "POST", {"condition": "fwb", "session": "S1", "foot": "right"})[0] == 400
    assert json.loads(call(f"{op}/api/captures", "POST", {"condition": "object", "session": "S1", "foot": "right"})[1])["id"]


def test_static_traversal_blocked(servers):
    op, _, _ = servers
    assert call(f"{op}/../pyproject.toml")[0] == 404
    assert call(f"{op}/assets/%2e%2e/%2e%2e/pyproject.toml")[0] == 404
    assert call(f"{op}/api/submissions/..%2F..%2Fx")[0] in (400, 404)
