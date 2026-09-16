// SVG coverage map: viewing angles around the foot, seen from above.
import { footSvg } from "./layout.js";
import { AZ_SECTORS } from "./quality.js";

const R = { cx: 100, cy: 100, low: [70, 96], mid: [44, 70], top: 44 };
const polar = (r, deg) => [R.cx + r * Math.sin((deg * Math.PI) / 180), R.cy + r * Math.cos((deg * Math.PI) / 180)];

function wedge(r1, r2, a1, a2) {
  const [x1, y1] = polar(r2, a1), [x2, y2] = polar(r2, a2), [x3, y3] = polar(r1, a2), [x4, y4] = polar(r1, a1);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 1 ${x4} ${y4}Z`;
}

function radiusFor(elevation) {
  if (elevation < 25) return 96 - (26 * elevation) / 25;
  if (elevation < 60) return 70 - (26 * (elevation - 25)) / 35;
  return 44 - (40 * (elevation - 60)) / 30;
}

export class CoverageMap {
  constructor(svg, foot, { labels = true } = {}) {
    this.svg = svg;
    const step = 360 / AZ_SECTORS;
    let s = "";
    for (const band of ["low", "mid"]) {
      const [r1, r2] = R[band];
      for (let i = 0; i < AZ_SECTORS; i++) s += `<path class="cell" data-cell="${band}-${i}" d="${wedge(r1, r2, i * step, (i + 1) * step)}"/>`;
    }
    s += `<circle class="cell" data-cell="top" cx="${R.cx}" cy="${R.cy}" r="${R.top}"/>`;
    s += `<g transform="translate(76 70) scale(0.24)">${footSvg({ mirror: foot === "left", cls: "foot" })}</g>`;
    if (labels) {
      // Seen from above with toes up, a right foot's big toe is on the left.
      const [l, r] = foot === "right" ? ["inner", "outer"] : ["outer", "inner"];
      s += `<text x="100" y="208" text-anchor="middle">heel · start here</text><text x="100" y="-4" text-anchor="middle">toes</text>`;
      s += `<text x="-10" y="103">${l}</text><text x="210" y="103" text-anchor="end">${r}</text>`;
    }
    s += `<circle class="you" r="6" cx="100" cy="196" visibility="hidden"/>`;
    svg.setAttribute("viewBox", "-12 -12 224 224");
    svg.innerHTML = s;
    this.cells = new Map([...svg.querySelectorAll(".cell")].map((el) => [el.dataset.cell, el]));
    this.you = svg.querySelector(".you");
  }

  update({ coverage, view, next, hasSensor, active }) {
    this.svg.classList.toggle("no-sensor", !hasSensor);
    for (const [cell, el] of this.cells) {
      const f = coverage.fill(cell);
      el.style.fill = f === 0 ? "" : `color-mix(in srgb, var(--brand) ${Math.round(25 + 75 * f)}%, var(--surface-2))`;
      el.classList.toggle("next", active && cell === next);
    }
    if (view) {
      const [x, y] = polar(radiusFor(view.elevation), view.azimuth);
      this.you.setAttribute("cx", x);
      this.you.setAttribute("cy", y);
      this.you.setAttribute("visibility", "visible");
    } else this.you.setAttribute("visibility", "hidden");
  }
}

export const MAP_CSS = `
  .map text { font-size: 7.5px; fill: var(--muted); font-family: var(--font); }
  .map .cell { fill: var(--surface-2); stroke: var(--surface); stroke-width: 1.3; transition: fill 0.2s; }
  .map .cell.next { stroke: var(--accent); stroke-width: 2.6; }
  .map .foot { fill: var(--surface); stroke: var(--muted); stroke-width: 2; }
  .map .you { fill: var(--accent); stroke: var(--ink); stroke-width: 1.5; }
  .map.no-sensor .cell { fill: var(--surface-2) !important; }
`;
