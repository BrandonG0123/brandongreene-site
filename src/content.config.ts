import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Content lives in /content at the repo root, one markdown file per project.
 * Adding project fourteen is writing one file. See CONTRIBUTING.md.
 */

const STATUS = ['shipped', 'in-progress', 'planned'] as const;
const AREA = ['software', 'hardware', 'research'] as const;

const link = z.object({
  label: z.string(),
  href: z.string().url(),
  // Every link on this site resolves or is not shown. scripts/check-links.mjs
  // verifies these at build time.
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './content/projects' }),
  // image() resolves a path relative to the markdown file and hands back real
  // dimensions, so width/height are never typed by hand and never wrong —
  // which is what actually prevents layout shift.
  schema: ({ image }) => z.object({
    title: z.string(),
    /** One sentence: what it is and who it was for. Shown in the grid. */
    summary: z.string(),
    status: z.enum(STATUS),
    areas: z.array(z.enum(AREA)).min(1),
    started: z.coerce.date(),
    updated: z.coerce.date().optional(),
    /** Featured projects appear on the home page. Max three, enforced in the page. */
    featured: z.boolean().default(false),
    /**
     * draft: true renders a loud unpublished banner and excludes the page from
     * the sitemap, the index and the home page. This is the mechanism that stops
     * half-written work from quietly going live.
     */
    draft: z.boolean().default(false),
    /**
     * placeholder: true is a layout slot, not a project. It renders ONLY in
     * `astro dev` so you can see how the list behaves with more entries, and is
     * stripped from every production build — pages, index, home, sitemap, RSS.
     * Nothing marked placeholder can reach a deployed site.
     *
     * To turn a slot into a real project: fill in the fields, write the body,
     * and delete this line.
     */
    placeholder: z.boolean().default(false),
    /** Group work is labelled as group work, with the specific contribution named. */
    collaboration: z.enum(['solo', 'group']).default('solo'),
    role: z.string().optional(),
    /** Disclosed where a reader would reasonably want to know. */
    aiAssisted: z.string().optional(),
    hero: z
      .object({
        src: image(),
        alt: z.string().min(12, 'Alt text must describe what matters, not the filename.'),
        caption: z.string().optional(),
      })
      .optional(),
    links: z.array(link).default([]),
  }),
});

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** Slug of the related project, or omitted for general entries. */
    project: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, log };
