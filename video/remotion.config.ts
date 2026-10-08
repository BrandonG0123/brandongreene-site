/**
 * The film imports the site's own scene code (../src/scripts/orbit/film) and
 * the site's copy of three.js, so the film and the live page can never drift
 * apart. Resolve modules from the site's node_modules as well as this one's.
 */
import path from 'node:path';
import { Config } from '@remotion/cli/config';

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    modules: [path.resolve('node_modules'), path.resolve('../node_modules'), 'node_modules'],
    alias: { ...(config.resolve?.alias ?? {}), 'three$': path.resolve('../node_modules/three/build/three.module.js'), 'three/addons': path.resolve('../node_modules/three/examples/jsm') },
  },
}));
// WebGL in headless Chrome: on a Mac this uses the GPU; elsewhere, software.
Config.setChromiumOpenGlRenderer(process.platform === 'darwin' ? 'angle' : 'swangle');
