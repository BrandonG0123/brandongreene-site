// Customer flow: about you -> survey -> scan plan -> (setup -> scan -> save) per planned scan -> send.
// The survey questions and the scan plan both come from the server
// (src/footscan/survey.py), so this file only renders them.
import { CoverageMap, MAP_CSS } from "./coverage-map.js";
import { Scanner, cameraErrorMessage, loadBoards, requestMotionPermission } from "./scanner.js";
import { createStageView } from "./stage-view.js";
import { DIAGRAM_CSS, matDiagram, phonePathDiagram } from "./diagrams.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MIN_FRAMES = 20;
let matTolerance = null;
// ?demo=1 shows a simulated camera for trying the flow on a laptop. Demo mode
// never creates a submission or uploads anything.
const DEMO = new URLSearchParams(location.search).has("demo");

$("map-css").textContent = MAP_CSS + DIAGRAM_CSS;
$("mat-diagram").innerHTML = matDiagram();
$("path-diagram").innerHTML = phonePathDiagram();

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
  if (!flow.name) errors.push("Please type your name.");
  if (!Object.values(flow.acks).every(Boolean)) errors.push("Please tick all four boxes to carry on.");
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
    if (q.required && empty) errors[q.id] = q.type === "confirm" ? "Please tick this to carry on." : "Please answer this one.";
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
    $("survey-error").textContent = "Please answer the questions marked in red.";
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
    ? "Ask someone to hold the phone for the standing scans. Each scan takes about five minutes."
    : "Each scan takes about five minutes.";
  $("plan-error").textContent = DEMO ? "Demo mode: nothing will be sent." : "";
  loadMatBars().then(() => {
    describeExpected();
    if (DEMO && !$("mat-check").value) $("mat-check").value = String(currentBar().value);
  });
  show("plan", "survey");
}

document.querySelectorAll("input[name=mat-unit]").forEach((r) =>
  r.addEventListener("change", () => { $("mat-check").value = ""; describeExpected(); }));

$("btn-plan-back").addEventListener("click", () => {
  flow.sectionIndex = flow.sections.length - 1;
  renderSection();
});

// The mat prints two check bars (10 cm and 4 in) so any ruler works. A
// printer's "fit to page" is out by 3-6%, far more than a ruler's error.
let matBars = null;
async function loadMatBars() {
  if (!matBars) {
    const info = await api("/mat", { method: "GET" });
    matBars = info.check_bars;
    matTolerance = info.tolerance_mm;
  }
  return matBars;
}
const matUnit = () => document.querySelector("input[name=mat-unit]:checked").value;
const currentBar = () => matBars?.find((b) => b.unit === matUnit());

function describeExpected() {
  const bar = currentBar();
  $("mat-expect").textContent = bar ? `It should end at ${bar.value} ${bar.unit === "cm" ? "cm" : "inches"}.` : "";
}

function checkMatPrint() {
  const bar = currentBar();
  if (!bar) return "Couldn't load the mat details. Reload the page and try again.";
  const raw = $("mat-check").value;
  const unit = bar.unit === "cm" ? "cm" : "inches";
  if (!raw) return `Print the mat, measure the ${unit} bar with a ruler, and type the number it ends at.`;
  const value = Number(raw);
  const mm = value * (bar.length_mm / bar.value);
  if (Math.abs(mm - bar.length_mm) > (matTolerance ?? 1.5))
    return `Your bar ends at ${value} ${unit}, but it should end at ${bar.value}. The printer made the mat the wrong size. Print it again with size set to 100% ("Actual size"), then measure again.`;
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
  flow.matCheck = { value: Number($("mat-check").value), unit: matUnit() };
  if (!DEMO && !flow.submission) {
    btn.disabled = true;
    try {
      const created = await api("/submissions", {
        json: {
          name: flow.name, feet: flow.feet, acknowledgments: flow.acks, survey: flow.answers,
          mat_check_value: flow.matCheck.value, mat_check_unit: flow.matCheck.unit, device: navigator.userAgent,
        },
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
    "<strong>Sit on a chair.</strong> Bend your knee so your lower leg points straight down.",
    "<strong>Put your bare foot flat in the middle of the mat</strong>, heel at the sheet 1 end. Roll trousers up past your ankle.",
    "<strong>Turn the lights on</strong> or open a curtain, so your foot is bright with no dark shadows.",
    "<strong>Ask someone to hold the phone</strong> if you can. It is much easier to reach behind your heel.",
    "<strong>Keep your foot still</strong> the whole time. Only the phone moves.",
  ],
  fwb: [
    "<strong>Stand up straight and barefoot</strong>, with this foot in the middle of the mat, heel at the sheet 1 end.",
    "<strong>Put the same weight on both feet</strong>, feet a little apart, and look straight ahead.",
    "<strong>Someone else holds the phone</strong> for this one, because you need to stand still.",
    "<strong>Turn the lights on</strong> so your foot is bright with no dark shadows.",
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
    stage: $("stage"), simulated, boards, requireMat: true, foot: scan.foot,
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
    $("saving-error").textContent = `The photos did not send (${err.message}). Check your Wi-Fi, then tap Try again.`;
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
