// Scanner engine shared by the customer scan flow and the research capture page.
//
// Owns the camera (or simulated camera), runs the frame-quality checks on a
// timer, keeps good frames, tracks coverage, and reports state through
// onUpdate. It has no page-specific UI.
import {
  Coverage, SharpnessJudge, cellFor, describeCell, exposureStats, judgeExposure,
  laplacianVariance, nextMissing, shouldCapture, toGray, viewFromOrientation,
} from "./quality.js";
import { SimulatedCamera } from "./sim-camera.js";

const ANALYSIS_WIDTH = 240;
const TICK_MS = 120;
const MIN_INTERVAL_MS = 600;

export async function requestMotionPermission() {
  // iOS only grants motion sensors in response to a tap, so call this from a click handler.
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") {
    try { await DOE.requestPermission(); } catch { /* denied: scanning continues without the map */ }
  }
}

export function cameraErrorMessage(err) {
  if (!navigator.mediaDevices) return "This browser can't open the camera on this page. Open the https:// address instead.";
  if (err?.name === "NotAllowedError") return "Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.";
  if (err?.name === "NotFoundError") return "No camera was found on this device.";
  return `The camera couldn't start (${err?.name || "unknown error"}).${window.isSecureContext ? "" : " Camera access needs an https:// address."}`;
}

export class Scanner {
  constructor({ stage, simulated = false, targetFrames = 60, onUpdate = () => {}, onFrame = () => {} }) {
    Object.assign(this, { stage, simulated, targetFrames, onUpdate, onFrame });
    this.frames = [];
    this.coverage = new Coverage();
    this.judge = new SharpnessJudge();
    this.rejected = { blur: 0, exposure: 0 };
    this.capturing = false;
    this.started = false;
    this.lastCaptureAt = 0;
    this.lastOpportunityAt = 0;
    this.orientation = null;
    this.alpha0 = null;
    this.view = null;
    this.elapsedBefore = 0;
    this.startedAt = null;
    this.orientationSource = simulated ? "simulated" : "none";
    this.analysis = document.createElement("canvas");
    this.grab = document.createElement("canvas");
    this._onOrientation = (e) => {
      if (e.alpha == null || e.beta == null) return;
      // True compass heading on iOS drifts less than relative alpha.
      const alpha = typeof e.webkitCompassHeading === "number" ? 360 - e.webkitCompassHeading : e.alpha;
      this.orientation = { alpha, beta: e.beta, gamma: e.gamma };
      this.orientationSource = "device_sensors";
    };
  }

  /** Opens the camera. Throws the getUserMedia error if it can't. */
  async open() {
    if (this.simulated) {
      this.sim = new SimulatedCamera();
      this.sim.canvas.className = "feed";
      this.stage.prepend(this.sim.canvas);
      this.drawable = this.sim.canvas;
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const video = document.createElement("video");
      Object.assign(video, { playsInline: true, muted: true, autoplay: true, className: "feed" });
      video.setAttribute("playsinline", "");
      video.srcObject = this.stream;
      this.stage.prepend(video);
      await video.play().catch(() => {});
      this.drawable = video;
      window.addEventListener("deviceorientation", this._onOrientation);
    }
    this.resumeLoop();
  }

  resumeLoop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(performance.now()), TICK_MS);
  }

  start() {
    if (this.alpha0 == null) {
      const o = this.simulated ? this.sim.orientation() : this.orientation;
      this.alpha0 = o ? o.alpha : 0;
    }
    this.started = true;
    this.capturing = true;
    this.startedAt = performance.now();
  }

  pause() {
    if (!this.capturing) return;
    this.capturing = false;
    this.elapsedBefore += performance.now() - this.startedAt;
  }

  resume() {
    if (this.capturing) return;
    this.capturing = true;
    this.startedAt = performance.now();
  }

  /** Stops the loop but keeps the camera open (for "capture more"). */
  hold() {
    this.pause();
    clearInterval(this.timer);
  }

  /** Releases the camera and removes the feed from the page. */
  close() {
    this.hold();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.drawable?.remove();
    window.removeEventListener("deviceorientation", this._onOrientation);
  }

  get elapsedMs() {
    return this.elapsedBefore + (this.capturing ? performance.now() - this.startedAt : 0);
  }

  keptFrames() {
    return this.frames.filter((f) => !f.excluded);
  }

  recount() {
    const c = new Coverage();
    for (const f of this.keptFrames()) if (f.cell) c.add(f.cell);
    this.coverage = c;
    return c;
  }

  tick(now) {
    if (this.simulated) {
      this.sim.render(now, this.capturing);
      this.orientation = this.sim.orientation();
    }
    const src = this.drawable;
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    if (!w || !h) return;

    const aw = ANALYSIS_WIDTH, ah = Math.round((ANALYSIS_WIDTH * h) / w);
    this.analysis.width = aw;
    this.analysis.height = ah;
    const actx = this.analysis.getContext("2d", { willReadFrequently: true });
    actx.drawImage(src, 0, 0, aw, ah);
    const gray = toGray(actx.getImageData(0, 0, aw, ah).data, aw, ah);
    const sharpScore = laplacianVariance(gray, aw, ah);
    const expo = exposureStats(gray);
    const sharp = this.judge.judge(sharpScore);
    const exposure = judgeExposure(expo);

    const hasSensor = this.orientation != null;
    this.view = hasSensor && this.alpha0 != null ? viewFromOrientation(this.orientation, this.alpha0) : null;
    const cell = this.view ? cellFor(this.view) : null;

    if (this.capturing && now - this.lastOpportunityAt >= MIN_INTERVAL_MS) {
      const keep = shouldCapture({
        sharpOk: sharp.ok, exposureOk: exposure.ok, now, lastCaptureAt: this.lastCaptureAt,
        cell, coverage: this.coverage, minIntervalMs: MIN_INTERVAL_MS,
      });
      if (keep) {
        this.lastCaptureAt = now;
        this.grabFrame(src, w, h, { sharpScore, relative: sharp.relative, exposure: expo, view: this.view, cell });
      } else if (!exposure.ok) this.rejected.exposure++;
      else if (!sharp.ok) this.rejected.blur++;
      this.lastOpportunityAt = now;
    }

    const kept = this.keptFrames().length;
    const completeness = hasSensor ? this.coverage.completeness() : null;
    const next = hasSensor ? nextMissing(this.coverage, this.view) : null;
    const done = kept >= this.targetFrames && (!hasSensor || completeness >= 1);
    // Progress for a single bar: frames and coverage both have to be there.
    const progress = Math.min(kept / this.targetFrames, completeness ?? 1);

    this.onUpdate({
      sharp, exposure, hasSensor, cell, next, kept, completeness, done, progress,
      guidance: this.guidance({ sharp, exposure, hasSensor, cell, next, kept, done }),
    });
  }

  guidance({ sharp, exposure, hasSensor, cell, next, kept, done }) {
    if (!this.started) return { text: "Stand behind the heel, then tap Start.", tone: "" };
    if (!this.capturing) return { text: "Paused.", tone: "" };
    if (!exposure.ok) return { text: exposure.message, tone: "bad" };
    if (!sharp.ok) return { text: sharp.message, tone: "bad" };
    if (done) return { text: "That's everything. Tap Finish.", tone: "done" };
    if (!hasSensor)
      return { text: `Walk slowly all the way around the foot, low down, then again from higher up, then a few from above. ${this.targetFrames - kept} photos to go.`, tone: "" };
    if (next && next !== cell) return { text: `Now move to: ${describeCell(next)}.`, tone: "" };
    if (next) return { text: "Good. Hold this angle a moment.", tone: "" };
    return { text: `All angles covered. ${Math.max(0, this.targetFrames - kept)} more photos.`, tone: "" };
  }

  grabFrame(src, w, h, info) {
    this.grab.width = w;
    this.grab.height = h;
    this.grab.getContext("2d").drawImage(src, 0, 0, w, h);
    const frame = { n: this.frames.length + 1, t_ms: Math.round(this.elapsedMs), width: w, height: h, excluded: false, ...info };
    this.frames.push(frame);
    if (info.cell) this.coverage.add(info.cell);
    this.grab.toBlob((blob) => {
      frame.blob = blob;
      frame.url = URL.createObjectURL(blob);
    }, "image/jpeg", 0.92);
    this.onFrame(frame);
  }

  /** Per-frame metadata for upload, numbered in upload order. */
  frameRecords() {
    return this.keptFrames().map((f, i) => ({
      file: `frame_${String(i + 1).padStart(4, "0")}.jpg`, original_n: f.n, t_ms: f.t_ms,
      width: f.width, height: f.height, sharpness: f.sharpScore, sharpness_relative: f.relative,
      exposure: f.exposure, view: f.view, cell: f.cell,
    }));
  }

  summary() {
    const cov = this.recount();
    return {
      frames_kept: this.keptFrames().length, target_frames: this.targetFrames,
      rejected_blur: this.rejected.blur, rejected_exposure: this.rejected.exposure,
      coverage_completeness: this.orientationSource === "none" ? null : cov.completeness(),
      orientation_source: this.orientationSource, duration_s: Math.round(this.elapsedMs / 1000),
    };
  }

  /** Waits until every kept frame has finished JPEG encoding. */
  async ready() {
    while (this.keptFrames().some((f) => !f.blob)) await new Promise((r) => setTimeout(r, 50));
  }
}
