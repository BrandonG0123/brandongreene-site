// Customer flow: about you -> survey -> scan plan -> (setup -> scan -> save) per planned scan -> send.
// The survey questions and the scan plan both come from the server
// (src/footscan/survey.py), so this file only renders them.
import { CoverageMap, MAP_CSS } from "./coverage-map.js";
import { Scanner, cameraErrorMessage, loadBoards, requestMotionPermission } from "./scanner.js";
import { createStageView } from "./stage-view.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MIN_FRAMES = 20;
// ?demo=1 shows a simulated camera for trying the flow on a laptop. Demo mode
// never creates a submission or uploads anything.
const DEMO = new URLSearchParams(location.search).has("demo");

$("map-css").textContent = MAP_CSS;

const flow = {
  name: "", feet: [], acks: {},
  sections: null, sectionIndex: 0, answers: {},
  evaluation: null,       // {flags, plan}
  submission: null,       // {id, upload_token}
  scanIndex: 0,
  results: {},            // scan key -> photo count
  scanner: null,
  stageView: null,
};
const currentScan = () => flow.evaluation.plan[flow.scanIndex];

function show(view, step) {
  for (const el of document.querySelectorAll("main > .view")) el.hidden = el.id !== `v-${view}`;
  const order = ["about", "survey", "scan", "send"];
  const at = order.indexOf(step);
  document.querySelectorAll("#steps li").forEach((li, i) => {
    li.className = i < at ? "done" : i === at ? "current" : "";
    li.toggleAttribute("aria-current", i === at);
  });
  window.scrollTo({ top: 0 });
}

async function api(path, { method = "POST", json, body, headers = {} } = {}) {
  const h = { ...headers };
  if (flow.submission) h["X-Upload-Token"] = flow.submission.upload_token;
  if (json) h["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, { method, headers: h, body: json ? JSON.stringify(json) : body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `request failed (${res.status})`), { status: res.status, data });
  return data;
}

// =========================================================================
// 1. About you
// =========================================================================
$("about-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  flow.name = $("name").value.trim();
  flow.feet = f.feet.value === "both" ? ["right", "left"] : [f.feet.value];
  flow.acks = Object.fromEntries(
    ["not_medical_device", "clinician_review", "break_in", "photo_consent"].map((k) => [k, f[k].checked]));
  const errors = [];
  if (!flow.name) errors.push("Enter your name.");
  if (!Object.values(flow.acks).every(Boolean)) errors.push("Please confirm all four points to continue.");
  $("about-error").textContent = errors.join(" ");
  if (errors.length) return;

  if (!flow.sections) {
    try {
      flow.sections = (await api("/survey", { method: "GET" })).sections;
    } catch (err) {
      $("about-error").textContent = `Couldn't load the questions: ${err.message}`;
      return;
    }
  }
  flow.sectionIndex = 0;
  renderSection();
});

// =========================================================================
// 2. Survey
// =========================================================================
const applies = (q) => Object.entries(q.show_if || {}).every(([k, vals]) => vals.includes(flow.answers[k]));

function renderSection() {
  const section = flow.sections[flow.sectionIndex];
  $("survey-eyebrow").textContent = `Questions · ${flow.sectionIndex + 1} of ${flow.sections.length}`;
  $("survey-title").textContent = section.title;
  $("survey-intro").textContent = section.intro || "";
  $("survey-error").textContent = "";
  $("btn-survey-next").textContent = flow.sectionIndex === flow.sections.length - 1 ? "See my scans" : "Next";

  $("survey-form").innerHTML = section.questions.map((q) => {
    const hint = q.hint ? `<span class="hint">${esc(q.hint)}</span>` : "";
    const a = flow.answers[q.id];
    if (q.type === "single" || q.type === "multi") {
      const type = q.type === "single" ? "radio" : "checkbox";
      const opts = q.options.map(([v, label]) => {
        const checked = q.type === "single" ? a === v : (a || []).includes(v);
        return `<label class="choice"><input type="${type}" name="${q.id}" value="${esc(v)}"${checked ? " checked" : ""}><span>${esc(label)}</span></label>`;
      }).join("");
      return `<fieldset class="q" data-q="${q.id}"><legend>${esc(q.label)}</legend>${hint}<div class="choices">${opts}</div><p class="q-error"></p></fieldset>`;
    }
    if (q.type === "confirm") {
      return `<div class="q" data-q="${q.id}"><label class="confirm"><input type="checkbox" name="${q.id}"${a ? " checked" : ""}><span>${esc(q.label)}</span></label><p class="q-error"></p></div>`;
    }
    const attrs = q.type === "number"
      ? `type="number" inputmode="decimal" min="${q.min}" max="${q.max}" step="0.1"`
      : `type="text" maxlength="${q.max || 200}"`;
    return `<div class="q field" data-q="${q.id}"><label class="q-label" for="q-${q.id}">${esc(q.label)}</label>${hint}
      <input id="q-${q.id}" name="${q.id}" ${attrs} value="${esc(a ?? "")}"><p class="q-error"></p></div>`;
  }).join("");
  syncVisibility();
  show("survey", "survey");
}

function readAnswer(q) {
  const form = $("survey-form");
  if (q.type === "single") return form.querySelector(`input[name="${q.id}"]:checked`)?.value;
  if (q.type === "multi") return [...form.querySelectorAll(`input[name="${q.id}"]:checked`)].map((i) => i.value);
  if (q.type === "confirm") return form.querySelector(`input[name="${q.id}"]`).checked || undefined;
  const v = form.querySelector(`input[name="${q.id}"]`).value.trim();
  return v === "" ? undefined : q.type === "number" ? Number(v) : v;
}

function syncVisibility() {
  for (const q of flow.sections[flow.sectionIndex].questions) {
    flow.answers[q.id] = readAnswer(q);
    const el = $("survey-form").querySelector(`[data-q="${q.id}"]`);
    el.hidden = !applies(q);
    if (el.hidden) delete flow.answers[q.id];
  }
}

$("survey-form").addEventListener("change", (e) => {
  const q = flow.sections[flow.sectionIndex].questions.find((x) => x.id === e.target.name);
  if (q?.type === "multi") {
    // "None of these" clears the others, and vice versa.
    const boxes = [...$("survey-form").querySelectorAll(`input[name="${q.id}"]`)];
    if (q.exclusive && e.target.checked) {
      for (const b of boxes) if ((e.target.value === q.exclusive) !== (b.value === q.exclusive)) b.checked = false;
    }
    if (q.max_select) {
      const n = boxes.filter((b) => b.checked).length;
      for (const b of boxes) b.disabled = !b.checked && n >= q.max_select;
    }
  }
  const el = e.target.closest(".q");
  el?.classList.remove("invalid");
  if (el) el.querySelector(".q-error").textContent = "";
  syncVisibility();
});

function sectionErrors() {
  const errors = {};
  for (const q of flow.sections[flow.sectionIndex].questions) {
    if (!applies(q)) continue;
    const a = flow.answers[q.id];
    const empty = a === undefined || (Array.isArray(a) && !a.length);
    if (q.required && empty) errors[q.id] = q.type === "confirm" ? "Please confirm to continue." : "Please answer this.";
    else if (q.type === "number" && !empty && !(a >= q.min && a <= q.max)) errors[q.id] = `Enter a number between ${q.min} and ${q.max}.`;
  }
  return errors;
}

function showErrors(errors) {
  let first = null;
  for (const el of $("survey-form").querySelectorAll(".q")) {
    const msg = errors[el.dataset.q];
    el.classList.toggle("invalid", !!msg);
    el.querySelector(".q-error").textContent = msg || "";
    if (msg && !first) first = el;
  }
  first?.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("btn-survey-back").addEventListener("click", () => {
  syncVisibility();
  if (flow.sectionIndex === 0) return show("about", "about");
  flow.sectionIndex--;
  renderSection();
});

$("btn-survey-next").addEventListener("click", async () => {
  syncVisibility();
  const errors = sectionErrors();
  showErrors(errors);
  if (Object.keys(errors).length) {
    $("survey-error").textContent = "Please answer the highlighted questions.";
    return;
  }
  if (flow.sectionIndex < flow.sections.length - 1) {
    flow.sectionIndex++;
    return renderSection();
  }
  const btn = $("btn-survey-next");
  btn.disabled = true;
  try {
    const evaluation = await api("/survey/evaluate", { json: { feet: flow.feet, survey: flow.answers } });
    if (evaluation.blocked) return showStopped(evaluation.blocked);
    flow.evaluation = evaluation;
    renderPlan();
  } catch (err) {
    $("survey-error").textContent = err.data?.fields
      ? "Some answers need another look. Go back through the questions."
      : `Something went wrong: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

function showStopped(blocked) {
  $("stopped-message").textContent = blocked.message;
  show("stopped", "survey");
}
$("btn-stopped-back").addEventListener("click", () => {
  flow.sectionIndex = 0;
  renderSection();
});

// =========================================================================
// 2c. Scan plan
// =========================================================================
function renderPlan() {
  const { plan, flags } = flow.evaluation;
  const before = flags.filter((f) => f.level === "before_wear" && f.customer);
  $("plan-flags").hidden = !before.length;
  $("plan-flag-list").innerHTML = before.map((f) => `<li>${esc(f.customer)}</li>`).join("");
  $("plan-list").innerHTML = plan.map((p) =>
    `<li><div><p><strong>${esc(p.label)}</strong></p><p class="why">${esc(p.why)}</p></div></li>`).join("");
  const standing = plan.some((p) => p.condition === "fwb");
  $("plan-helper").textContent = standing
    ? "You'll need someone to hold the phone for the standing scans. Allow about five minutes per scan."
    : "Allow about five minutes per scan.";
  $("plan-error").textContent = DEMO ? "Demo mode: nothing will be sent." : "";
  if (DEMO && !$("mat-check").value) $("mat-check").value = "100";
  show("plan", "survey");
}

$("btn-plan-back").addEventListener("click", () => {
  flow.sectionIndex = flow.sections.length - 1;
  renderSection();
});

// A printer's "fit to page" typically shrinks by 3-6%, i.e. 3-6 mm on this bar.
// Ruler reading error is about 0.5 mm, so 1 mm is the tolerance.
function checkMatPrint() {
  const v = Number($("mat-check").value);
  if (!$("mat-check").value) return "Print the scan mat and enter the length of the black bar.";
  if (Math.abs(v - 100) > 1)
    return `Your bar measures ${v} mm, so the printer resized the mat. Print it again at 100% / "Actual size" (turn off "Fit to page"), then measure again.`;
  return null;
}

$("btn-plan-start").addEventListener("click", async () => {
  const btn = $("btn-plan-start");
  const matProblem = checkMatPrint();
  if (matProblem) {
    $("plan-error").textContent = matProblem;
    $("mat-check").focus();
    return;
  }
  flow.matCheck = Number($("mat-check").value);
  if (!DEMO && !flow.submission) {
    btn.disabled = true;
    try {
      const created = await api("/submissions", {
        json: { name: flow.name, feet: flow.feet, acknowledgments: flow.acks, survey: flow.answers, mat_check_mm: flow.matCheck, device: navigator.userAgent },
      });
      flow.submission = created;
      flow.evaluation = { plan: created.plan, flags: created.flags };
    } catch (err) {
      btn.disabled = false;
      if (err.status === 422 && err.data?.blocked) return showStopped(err.data.blocked);
      $("plan-error").textContent = `Couldn't start: ${err.message}`;
      return;
    }
    btn.disabled = false;
  }
  flow.scanIndex = 0;
  openSetup();
});

// =========================================================================
// 3. Set up and scan, once per planned scan
// =========================================================================
const SETUP_STEPS = {
  swb: [
    "<strong>Sit on a chair</strong> with your knee bent at a right angle and your bare foot flat in the middle of the scan mat, heel toward sheet 1. Roll trousers up above the ankle.",
    "<strong>Find bright, even light</strong>, with no strong shadows on your foot.",
    "<strong>Ask someone to hold the phone</strong> if you can. It's much easier to get round the back of the heel.",
    "<strong>Keep your foot still</strong> for the whole scan, and keep the black squares in view. The phone moves; the foot doesn't.",
  ],
  fwb: [
    "<strong>Stand up straight</strong>, barefoot, with this foot in the middle of the scan mat (heel toward sheet 1) and your weight evenly on both feet.",
    "<strong>Someone else holds the phone</strong> for this one. You need to stay standing still.",
    "<strong>Look straight ahead</strong> and don't lean or shift your weight while they scan.",
    "<strong>Bright, even light</strong>, with no strong shadows on your foot.",
  ],
};

function openSetup() {
  const scan = currentScan();
  const total = flow.evaluation.plan.length;
  $("setup-eyebrow").textContent = `Scan ${flow.scanIndex + 1} of ${total}`;
  $("setup-title").textContent = `Get ready: ${scan.label.toLowerCase()}`;
  $("setup-steps").innerHTML = (SETUP_STEPS[scan.condition] || SETUP_STEPS.swb).map((t) => `<li><p>${t}</p></li>`).join("");
  $("load-hint").textContent = scan.condition === "fwb"
    ? "optional: stand with this foot on a bathroom scale and the other on a book of the same height"
    : "optional: put a scale under this foot and enter what it shows";
  $("load").value = "";
  $("setup-error").textContent = "";
  $("btn-open").hidden = DEMO;
  $("btn-demo").hidden = !DEMO;
  show("setup", "scan");
}

$("btn-open").addEventListener("click", () => startScan(false));
$("btn-demo").addEventListener("click", () => startScan(true));

async function startScan(simulated) {
  await requestMotionPermission();
  const scan = currentScan();
  $("scan-eyebrow").textContent = scan.label;
  $("demo-ribbon").hidden = !simulated;
  const map = new CoverageMap($("map"), scan.foot, { labels: false });
  const boards = await loadBoards();
  const scanner = new Scanner({
    stage: $("stage"), simulated, boards, requireMat: true,
    onUpdate: (s) => {
      map.update({ coverage: scanner.coverage, view: scanner.view, next: s.next, hasSensor: s.hasView, active: scanner.capturing });
      $("guidance").textContent = s.guidance.text;
      $("guidance").className = `guidance ${s.guidance.tone}`;
      $("progress-label").textContent = `${Math.round(100 * s.progress)}%`;
      $("progress-bar").style.width = `${100 * s.progress}%`;
      $("btn-finish").disabled = s.kept < MIN_FRAMES;
      $("btn-finish").className = s.done ? "btn accent" : "btn secondary";
    },
  });
  try {
    await scanner.open();
  } catch (err) {
    $("setup-error").textContent = cameraErrorMessage(err);
    return;
  }
  flow.scanner = scanner;
  $("btn-start").hidden = false;
  $("btn-pause").hidden = true;
  $("btn-finish").disabled = true;
  show("scan", "scan");
  // Scanning takes over the screen; the corner button parks it like a video player.
  flow.stageView ??= createStageView($("stage"), $("scan-hud"),
    { docked: [$("demo-ribbon"), $("guidance")] });
  flow.stageView.full();
}

$("btn-start").addEventListener("click", () => {
  flow.scanner.start();
  $("btn-start").hidden = true;
  $("btn-pause").hidden = false;
  $("btn-pause").textContent = "Pause";
});

$("btn-pause").addEventListener("click", () => {
  const s = flow.scanner;
  s.capturing ? s.pause() : s.resume();
  $("btn-pause").textContent = s.capturing ? "Pause" : "Resume";
});

$("btn-restart").addEventListener("click", () => {
  if (flow.scanner?.frames.length && !confirm("Delete the photos for this scan and start again?")) return;
  flow.stageView?.inline();
  flow.scanner?.close();
  flow.scanner = null;
  openSetup();
});

$("btn-finish").addEventListener("click", () => saveScan());

async function saveScan() {
  const scanner = flow.scanner;
  scanner.hold();
  flow.stageView?.inline();
  const scan = currentScan();
  $("saving-title").textContent = `Saving: ${scan.label.toLowerCase()}…`;
  $("saving-error").textContent = "";
  $("saving-actions").hidden = true;
  show("saving", "scan");
  const progress = (i, n, label) => {
    $("saving-label").textContent = label;
    $("saving-count").textContent = n ? `${i} / ${n}` : "";
    $("saving-bar").style.width = n ? `${(100 * i) / n}%` : "0";
  };

  try {
    await scanner.ready();
    const kept = scanner.keptFrames();
    if (!DEMO) {
      const base = `/submissions/${flow.submission.id}/scans/${scan.key}`;
      await api(`${base}/start`);
      for (let i = 0; i < kept.length; i++) {
        progress(i, kept.length, "Uploading photos");
        await api(`${base}/frames/${i + 1}`, { method: "PUT", body: kept[i].blob, headers: { "Content-Type": "image/jpeg" } });
      }
      await api(`${base}/complete`, {
        json: { frames: scanner.frameRecords(), summary: scanner.summary(), load_kg: $("load").value || null },
      });
    }
    progress(kept.length, kept.length, DEMO ? "Demo: nothing uploaded" : "Saved");
    flow.results[scan.key] = kept.length;
    scanner.close();
    flow.scanner = null;
    flow.scanIndex++;
    setTimeout(() => (flow.scanIndex < flow.evaluation.plan.length ? openSetup() : openSend()), 500);
  } catch (err) {
    $("saving-error").textContent = `Upload failed: ${err.message}. Check your connection.`;
    $("saving-actions").hidden = false;
  }
}

$("btn-retry-upload").addEventListener("click", () => saveScan());
$("btn-rescan").addEventListener("click", () => {
  flow.stageView?.inline();
  flow.scanner?.close();
  flow.scanner = null;
  openSetup();
});

// =========================================================================
// 4. Send
// =========================================================================
function openSend() {
  $("foot-rows").innerHTML = flow.evaluation.plan.map((p) =>
    `<div class="card foot-row"><strong>${esc(p.label)}</strong>
      <span class="badge ok">${flow.results[p.key]} photos</span></div>`).join("");
  $("send-error").textContent = DEMO ? "Demo mode: sending is disabled." : "";
  $("btn-send").disabled = DEMO;
  show("send", "send");
}

$("btn-send").addEventListener("click", async () => {
  $("btn-send").disabled = true;
  try {
    await api(`/submissions/${flow.submission.id}/submit`);
  } catch (err) {
    $("send-error").textContent = `Couldn't send: ${err.message}`;
    $("btn-send").disabled = false;
    return;
  }
  $("done-ref").textContent = flow.submission.id.replace(/^sub-/, "");
  flow.submission = null;
  show("done", "send");
  document.querySelectorAll("#steps li").forEach((li) => (li.className = "done"));
});

// Leaving mid-scan: release the camera.
window.addEventListener("pagehide", () => flow.scanner?.close());
