// Usage: node detect_markers.cjs <raw-gray-file> <width> <height>
// Prints the marker IDs and corners js-aruco2 finds, as JSON. Used by
// tests/test_mat.py to check the browser detector reads the printed mat.
const fs = require("fs");
const path = require("path");
const { AR } = require(path.join(__dirname, "../../web/vendor/js-aruco2/aruco.js"));

const [file, w, h] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const gray = fs.readFileSync(file);
const rgba = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) {
  rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = gray[i];
  rgba[4 * i + 3] = 255;
}
// ARUCO_MIP_36h12 has minimum Hamming distance 12, so at most floor((12-1)/2) = 5 bit errors can be corrected
// unambiguously. js-aruco2 defaults to accepting 12, which lets noise decode as markers.
const detector = new AR.Detector({ dictionaryName: "ARUCO_MIP_36h12", maxHammingDistance: Number(process.env.MAX_HAMMING ?? 5) });
const markers = detector.detectImage(w, h, rgba);
console.log(JSON.stringify(markers.map((m) => ({ id: m.id, corners: m.corners.map((c) => [c.x, c.y]) }))));
