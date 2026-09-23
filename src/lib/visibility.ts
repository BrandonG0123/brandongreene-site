import { getCollection } from 'astro:content';

/**
 * Single gate for what the site is allowed to show.
 *
 * Placeholders exist so the layout can be judged with a realistic number of
 * entries. They are development-only by construction: `import.meta.env.DEV` is
 * false in every `astro build`, so a production build cannot emit them even if
 * someone forgets they are there.
 */
export const SHOW_PLACEHOLDERS = import.meta.env.DEV;

export async function visibleProjects() {
  return getCollection(
    'projects',
    (p) => !p.data.draft && (SHOW_PLACEHOLDERS || !p.data.placeholder)
  );
}

export async function visibleLog() {
  return getCollection('log', (e) => !e.data.draft);
}
