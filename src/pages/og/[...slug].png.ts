import type { APIRoute, GetStaticPaths } from 'astro';
import { renderOg } from '../../lib/og';
import { visibleProjects } from '../../lib/visibility';
import { SITE } from '../../../astro.config.mjs';

/**
 * One generated card per project, plus a default for everything else.
 *
 * Placeholders are excluded by visibleProjects(), so a production build never
 * emits a card for a project that does not exist.
 */

const domain = new URL(SITE).hostname;

const fmt = (d: Date) =>
  d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export const getStaticPaths: GetStaticPaths = async () => {
  const projects = (await visibleProjects()).filter((p) => p.data.status !== 'planned');

  return [
    {
      params: { slug: 'default' },
      props: {
        title: 'I build hardware and software that has to work on something real.',
        facts: 'Projects, dated build log, résumé',
      },
    },
    ...projects.map((p) => ({
      params: { slug: p.id },
      props: {
        title: p.data.title,
        status: p.data.status,
        facts: `Started ${fmt(p.data.started)} · ${p.data.areas.join(' · ')}`,
      },
    })),
  ];
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg({
    title: props.title as string,
    status: props.status as 'shipped' | 'in-progress' | undefined,
    facts: props.facts as string,
    domain,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
