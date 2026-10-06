// Checking the printed mat with a ruler, with as little asked of the person as
// possible.
//
// The mat has two check bars: exactly 10 cm, and exactly 4 inches. Rather
// than asking which one was measured, work it out from the number: 10 and 4
// are far apart, so a reading near 10 was the cm bar and a reading near 4 was
// the inch bar. Then check it against that bar's length in millimetres.

/**
 * @param {number} value what the person typed
 * @param {{unit: string, value: number, length_mm: number}[]} bars from /api/mat
 * @param {number} toleranceMm how far off still counts as a correct print
 * @returns {{ok: boolean, bar?: object, reason?: "empty"|"unclear"|"wrong_size", message: string}}
 */
export function readCheckBar(value, bars, toleranceMm = 1.5) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) {
    return { ok: false, reason: "empty", message: "Type the number the black bar ends at on your ruler." };
  }
  const v = Number(value);
  // Nearest bar by relative difference: 9.6 is "the cm bar, a bit short",
  // 3.9 is "the inch bar, a bit short".
  const bar = bars.reduce((best, b) =>
    Math.abs(v - b.value) / b.value < Math.abs(v - best.value) / best.value ? b : best);
  if (Math.abs(v - bar.value) / bar.value > 0.2) {
    return {
      ok: false, reason: "unclear",
      message: "That number doesn't match either bar. Line the ruler's 0 up with the start of a black bar and read where it ends. It should be 10 on a cm ruler, or 4 on an inch ruler.",
    };
  }
  const mm = v * (bar.length_mm / bar.value);
  if (Math.abs(mm - bar.length_mm) > toleranceMm) {
    const unit = bar.unit === "cm" ? "cm" : "inches";
    return {
      ok: false, reason: "wrong_size", bar,
      message: `The bar ends at ${v} ${unit}, but it should end at exactly ${bar.value}. The printer made the mat the wrong size. Print it again with size set to 100% ("Actual size"), then measure again.`,
    };
  }
  return { ok: true, bar, message: "" };
}
