import type { APIRoute } from 'astro';
import { SITE } from '../../astro.config.mjs';

/**
 * Generated rather than static, so the sitemap URL follows SITE in
 * astro.config.mjs and cannot drift when the domain is decided.
 *
 * To keep the site out of search results before launch, set
 * PUBLIC_ALLOW_INDEXING=false in the host's environment variables.
 */
const allowIndexing = import.meta.env.PUBLIC_ALLOW_INDEXING !== 'false';

export const GET: APIRoute = () => {
  const body = allowIndexing
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', SITE).href}\n`
    : `# Indexing disabled via PUBLIC_ALLOW_INDEXING=false\nUser-agent: *\nDisallow: /\n`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
