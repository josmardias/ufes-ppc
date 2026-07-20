import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

// GitHub Pages serves static files with no server-side rewrites: reloading a
// client-side route (e.g. /profile) requests that path directly and 404s.
// GitHub Pages does fall back to a custom 404.html for any unmatched path, so
// copying the built index.html there lets the SPA boot and wouter take over
// routing from the URL (see docs/ARCHITECTURE.md, "Deployment").
function spaFallback404() {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      copyFileSync(
        resolve(rootDir, 'dist/index.html'),
        resolve(rootDir, 'dist/404.html'),
      );
    },
  };
}

// Served from a GitHub Pages project subpath (see docs/ARCHITECTURE.md, "Deployment").
export default defineConfig({
  base: '/ufes-ppc/',
  plugins: [react(), tailwindcss(), spaFallback404()],
  test: {
    // Scope discovery to src/ instead of excluding e2e/ (which uses Playwright's
    // own `test()`) — narrower and faster than a broad exclude, and keeps the
    // default node_modules/.git exclusions intact.
    dir: 'src',
  },
});
