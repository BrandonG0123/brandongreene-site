import assert from "node:assert/strict";
import { test } from "node:test";

import { readCheckBar } from "../../web/assets/mat-check.js";

const BARS = [
  { unit: "cm", value: 10, length_mm: 100 },
  { unit: "in", value: 4, length_mm: 101.6 },
];

test("works out which bar was measured from the number alone", () => {
  assert.equal(readCheckBar(10, BARS).bar.unit, "cm");
  assert.equal(readCheckBar(10.1, BARS).bar.unit, "cm");
  assert.equal(readCheckBar(4, BARS).bar.unit, "in");
  assert.equal(readCheckBar("3.97", BARS).bar.unit, "in");
  assert.equal(readCheckBar(10, BARS).ok, true);
  assert.equal(readCheckBar(4, BARS).ok, true);
});

test("catches a shrunk print on either bar", () => {
  const cm = readCheckBar(9.6, BARS); // fit-to-page, about 4% small
  assert.equal(cm.ok, false);
  assert.equal(cm.reason, "wrong_size");
  assert.equal(cm.bar.unit, "cm");
  const inch = readCheckBar(3.8, BARS);
  assert.equal(inch.ok, false);
  assert.equal(inch.bar.unit, "in");
});

test("asks again for empty or nonsense readings", () => {
  assert.equal(readCheckBar("", BARS).reason, "empty");
  assert.equal(readCheckBar(null, BARS).reason, "empty");
  assert.equal(readCheckBar(7, BARS).reason, "unclear"); // between the two bars
  assert.equal(readCheckBar(25, BARS).reason, "unclear");
});
