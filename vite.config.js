import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served from a GitHub Pages project subpath (see docs/ARCHITECTURE.md, "Deployment").
export default defineConfig({
  base: '/ufes-ppc/',
  plugins: [react(), tailwindcss()],
});
