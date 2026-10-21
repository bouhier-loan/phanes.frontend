import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { CSP_HEADER, CSP_META } from './csp.ts';

/** Adds the CSP <meta> tag to the production index.html (the dev server needs inline scripts). */
function cspMeta(): Plugin {
  return {
    name: 'phanes-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  build: {
    target: 'es2023',
    // All target browsers support modulepreload; the polyfill would use fetch().
    modulePreload: { polyfill: false },
  },
  worker: {
    format: 'es',
  },
  preview: {
    headers: {
      'Content-Security-Policy': CSP_HEADER,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
