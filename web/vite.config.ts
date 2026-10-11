import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Every page of the app is an .html file in this folder: index.html is the globe,
// stats.html is the dashboard, logbook.html is the live feed, submit.html is the form with no globe. To add a page, create its .html file and list it here.
const PAGES = ['index', 'stats', 'logbook', 'submit'];

const pageFile = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

// Lets you open /stats instead of /stats.html while developing.
// (The real server does the same thing: see api/src/app.ts.)
const shortPageAddresses: Plugin = {
  name: 'short-page-addresses',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const match = /^\/([a-z0-9-]+)(\?.*)?$/.exec(request.url ?? '');
      if (match && existsSync(pageFile(match[1]))) request.url = `/${match[1]}.html${match[2] ?? ''}`;
      next();
    });
  },
};

export default defineConfig(({ mode }) => {
  // Read PORT from the .env in the repo root so the dev proxy finds the API.
  const env = loadEnv(mode, '..', '');
  const apiPort = env.PORT || '8080';

  return {
    plugins: [shortPageAddresses],
    server: {
      host: true, // also reachable from phones on the same Wi-Fi while developing
      port: 3000,
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
    build: {
      rollupOptions: { input: PAGES.map(pageFile) },
      // The globe library and the bundled map data are big; that's expected.
      chunkSizeWarningLimit: 3000,
    },
  };
});
