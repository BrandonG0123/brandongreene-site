import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  cameraAt, estimateView, homography, indexBoard, lookAtCamera, matchDetections, project,
} from "../../web/assets/mat-pose.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The real board definition, straight from the Python generator.
const board = JSON.parse(execFileSync(join(root, ".venv/bin/python"), ["-c",
  "import json; from footscan import mat; print(json.dumps(mat.board('letter')))"], { encoding: "utf8" }));
const index = indexBoard(board);

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function synthesize(az, el, { f = 1400, w = 1920, h = 1080, noise = 0, dist = 700 } = {}) {
  const rand = rng(Math.round(az * 7 + el * 13 + 1));
  const C = cameraAt(az, el, dist, board.foot_center_mm);
  const proj = lookAtCamera(C, [...board.foot_center_mm, 0], f, w, h);
  const detections = [];
  for (const [id, { corners }] of index) {
    const px = corners.map(([X, Y]) => proj([X, Y, 0]));
    if (px.some((p) => !p || p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h)) continue;
    detections.push({ id, corners: px.map(([u, v]) => [u + (rand() - 0.5) * 2 * noise, v + (rand() - 0.5) * 2 * noise]) });
  }
  return { detections, C };
}

const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("homography recovers an exact projective map", () => {
  const H = [[1.2, 0.1, 30], [-0.05, 0.9, 12], [0.0004, 0.0002, 1]];
  const plane = [[0, 0], [100, 0], [100, 80], [0, 80], [50, 40], [20, 70]];
  const image = plane.map((p) => project(H, p));
  const Hest = homography(plane, image);
  for (const p of [[10, 10], [90, 5], [33, 66]]) {
    const [a, b] = [project(H, p), project(Hest, p)];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6);
  }
});

test("detections off the board and duplicates are dropped", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const big = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const out = matchDetections([{ id: 999, corners: sq }, { id: 0, corners: sq }, { id: 0, corners: big }], index);
  assert.equal(out.length, 1);
  assert.equal(out[0].area, 400);
});

for (const [az, el] of [[0, 30], [45, 20], [90, 45], [180, 35], [250, 55], [320, 15]]) {
  test(`camera view recovered at azimuth ${az}, elevation ${el} with 0.7 px noise`, () => {
    const { detections, C } = synthesize(az, el, { noise: 0.7 });
    const r = estimateView(detections, index, board, 1920, 1080);
    assert.ok(r.view, `no view (markers ${r.markers})`);
    assert.ok(angleDiff(r.view.azimuth, az) < 3, `azimuth ${r.view.azimuth.toFixed(1)} vs ${az}`);
    assert.ok(Math.abs(r.view.elevation - el) < 4, `elevation ${r.view.elevation.toFixed(1)} vs ${el}`);
    const camErr = Math.hypot(...r.camera.map((v, i) => v - C[i]));
    assert.ok(camErr < 60, `camera position off by ${camErr.toFixed(0)} mm`);
  });
}

test("focal length is estimated from an oblique view", () => {
  const { detections } = synthesize(60, 30, { f: 1500, noise: 0.3 });
  const r = estimateView(detections, index, board, 1920, 1080);
  assert.ok(r.focalMeasured && Math.abs(r.focalMeasured - 1500) / 1500 < 0.05, `focal ${r.focalMeasured}`);
});

test("nearly overhead: elevation still right using the focal hint", () => {
  const { detections } = synthesize(10, 84, { f: 1400, noise: 0.3, dist: 900 });
  const r = estimateView(detections, index, board, 1920, 1080, 1400);
  assert.ok(r.view && r.view.elevation > 75, `elevation ${r.view?.elevation}`);
});

test("too few markers gives no view", () => {
  const { detections } = synthesize(0, 30);
  const r = estimateView(detections.slice(0, 1), index, board, 1920, 1080);
  assert.equal(r.view, null);
});
