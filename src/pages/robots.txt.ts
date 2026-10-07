import type { APIRoute } from 'astro';
import { SITE } from '../../astro.config.mjs';

/**
 * Generated rather than static, so the sitemap URL follows SITE in
 * astro.config.mjs and cannot drift when the domain is decided.
 *
 * FAILS CLOSED: robots.txt disallows everything unless the build sets
 * PUBLIC_ALLOW_INDEXING=true. See the note in BaseHead.astro for why.
 */
const allowIndexing = import.meta.env.PUBLIC_ALLOW_INDEXING === 'true';

export const GET: APIRoute = () => {
  const body = allowIndexing
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', SITE).href}\n`
    : `# Not launched yet. Build with PUBLIC_ALLOW_INDEXING=true to allow indexing.\nUser-agent: *\nDisallow: /\n`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
