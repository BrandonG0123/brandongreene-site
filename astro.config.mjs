import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// NOTE: provisional domain. Nothing has been purchased. Change this one value
// when the domain is decided and canonical URLs, sitemap and RSS all follow.
export const SITE = 'https://brandongreene.dev';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    mdx(),
    sitemap({
      // Draft and planned pages must never enter the sitemap.
      filter: (page) => !page.includes('/draft/'),
    }),
  ],
  build: { inlineStylesheets: 'auto' },
  prefetch: false,
});
