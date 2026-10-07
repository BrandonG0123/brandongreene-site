/**
 * On phones, long sections fold away behind their headings: the page shows a
 * list of titles, and a tap opens the one you want. Wider screens, and phones
 * without JavaScript, get every section open as before.
 *
 * Built as an accordion: the heading keeps its level, a <button> inside it
 * carries aria-expanded and aria-controls, and the panel is `hidden` when shut.
 * A link to anything inside a section (/log#entry, /about#tennis) opens it.
 */
const PHONE = '(max-width: 40rem)';

export interface Section {
  heading: HTMLElement;
  /** Everything that belongs to the heading and folds away with it. */
  panel: HTMLElement[];
}

let uid = 0;

export function collapseOnPhone(sections: Section[]) {
  const mq = matchMedia(PHONE);
  if (!mq.matches || !sections.length) return;

  const items = sections.map(({ heading, panel }) => {
    // Gather the panel into one element so it can be labelled and hidden.
    const box = document.createElement('div');
    box.id = `collapse-${++uid}`;
    box.className = 'collapse__panel';
    panel[0]?.before(box);
    box.append(...panel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'collapse__toggle';
    btn.setAttribute('aria-controls', box.id);
    btn.append(...heading.childNodes);
    heading.append(btn);
    heading.classList.add('collapse__heading');

    const set = (open: boolean) => {
      btn.setAttribute('aria-expanded', String(open));
      box.hidden = !open;
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    set(false);
    return { heading, box, set };
  });

  // Follow links into a folded section: open it, then land on the target.
  const openForHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    const hit = items.find((it) => it.heading === target || it.heading.contains(target) || it.box.contains(target) || target.contains(it.heading));
    if (!hit) return;
    hit.set(true);
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  openForHash();
  addEventListener('hashchange', openForHash);

  // Turned to landscape, or a window widened past phone size: open everything.
  mq.addEventListener('change', () => { if (!mq.matches) items.forEach((it) => it.set(true)); });
}

/** Each heading and the siblings after it, up to the next heading of the same tag. */
export function sectionsFrom(container: Element, headingSelector: string): Section[] {
  const heads = [...container.querySelectorAll<HTMLElement>(headingSelector)];
  return heads.map((heading) => {
    const panel: HTMLElement[] = [];
    let el = heading.nextElementSibling as HTMLElement | null;
    while (el && !el.matches(headingSelector)) {
      panel.push(el);
      el = el.nextElementSibling as HTMLElement | null;
    }
    return { heading, panel };
  });
}
