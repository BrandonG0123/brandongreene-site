// Shared safety strip, header and footer. Every page carries the
// not-a-medical-device statement, on both the customer side and the studio.

export const FOOT_PATH =
  "M100 182C80 182 71 167 71 149C71 128 78 113 76 96C74 79 69 63 73 49C77 35 89 28 104 28C119 28 129 36 131 51C133 65 129 81 127 97C125 117 129 132 129 150C129 168 119 182 100 182Z";
export const TOES = [[85, 17, 9.5], [102, 13, 6.2], [114, 16, 5.6], [124, 22, 5], [131, 30, 4.4]];

export function footSvg({ mirror = false, cls = "" } = {}) {
  const t = mirror ? ' transform="translate(200 0) scale(-1 1)"' : "";
  const toes = TOES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
  return `<g class="${cls}"${t}><path d="${FOOT_PATH}"/>${toes}</g>`;
}

const NAV = {
  customer: [["/", "Scan"], ["/care.html", "Wearing your insole"]],
  studio: [
    ["/studio/", "Submissions"],
    ["/studio/capture.html", "Research capture"],
    ["/studio/captures.html", "Research library"],
    ["/studio/project.html", "Project"],
  ],
};

function mountLayout() {
  const area = document.body.dataset.area || "customer";
  const here = location.pathname.replace(/index\.html$/, "");

  const strip = document.createElement("div");
  strip.className = "safety-strip";
  strip.setAttribute("role", "note");
  strip.innerHTML = `<div class="wrap"><strong>NOT A MEDICAL DEVICE</strong>
    <span>${area === "studio"
      ? "Nothing leaves the studio for sport without clinician sign-off."
      : "A handmade 3D-printed insole, not a prescribed orthotic. Have a clinician check it before you play sport in it."}</span></div>`;

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `<div class="wrap">
    <a class="site-brand" href="${area === "studio" ? "/studio/" : "/"}">
      <svg class="site-brand-mark" viewBox="0 0 200 200" aria-hidden="true"><rect width="200" height="200" rx="46" fill="var(--brand)"/>
        <g fill="var(--brand-ink)" transform="translate(40 26) scale(0.6)">${footSvg()}</g></svg>
      footscan${area === "studio" ? ' <span class="badge brand" style="margin-left:4px">Studio</span>' : ""}</a>
    <nav class="nav" aria-label="Main">${NAV[area].map(([href, label]) =>
      `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav></div>`;

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `<div class="wrap">
    <p><strong>footscan is not a medical device</strong> and does not diagnose or treat anything. Its insoles are not
    equivalent to, comparable with, or a substitute for a prescribed orthotic. A badly shaped insole can move problems
    to the knee, hip or back. Have a podiatrist, physical therapist, sports-medicine doctor or athletic trainer check it
    before sport, follow the break-in guide, and stop on any new pain.</p></div>`;

  document.body.prepend(header);
  document.body.prepend(strip);
  document.body.append(footer);
}

mountLayout();
