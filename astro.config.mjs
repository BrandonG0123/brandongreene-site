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
  vite: {
    // Pre-bundle the animation and 3D libraries when the dev server starts.
    // Otherwise Vite discovers them mid-session, re-optimises, and any open tab
    // gets "504 Outdated Optimize Dep" on its scripts — which silently drops the
    // page into its no-JavaScript state.
    optimizeDeps: {
      include: [
        'motion',
        'three',
        'three/addons/controls/OrbitControls.js',
        'three/addons/loaders/STLLoader.js',
        'three/addons/loaders/GLTFLoader.js',
      ],
    },
  },
  prefetch: false,
});
