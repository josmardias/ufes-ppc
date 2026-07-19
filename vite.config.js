import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served from a GitHub Pages project subpath (see docs/ARCHITECTURE.md, "Deployment").
export default defineConfig({
  base: '/ufes-ppc/',
  plugins: [react(), tailwindcss()],
  test: {
    // Scope discovery to src/ instead of excluding e2e/ (which uses Playwright's
    // own `test()`) — narrower and faster than a broad exclude, and keeps the
    // default node_modules/.git exclusions intact.
    dir: 'src',
  },
});
