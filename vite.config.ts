import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';
import { loadEnv, type Plugin } from 'vite';

/** Fill the CSP's connect-src with the backend's origin (Apps Script also redirects to googleusercontent). */
function cspConnect(mode: string): Plugin {
  return {
    name: 'csp-connect-src',
    transformIndexHtml(html) {
      const vars = loadEnv(mode, process.cwd(), 'VITE_');
      const api = vars.VITE_API_URL ?? process.env.VITE_API_URL;
      const supabase = vars.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL; // only used with VITE_BACKEND=supabase
      const origins = new Set<string>(['https://script.google.com', 'https://script.googleusercontent.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://api.open-meteo.com', 'https://accounts.spotify.com', 'https://api.spotify.com']);
      if (api) origins.add(new URL(api).origin);
      if (supabase) origins.add(new URL(supabase).origin);
      return html.replace('__API_ORIGINS__', [...origins].join(' '));
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: mode === 'artifact'
    ? { outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, rollupOptions: { output: { inlineDynamicImports: true } } }
    : {},
  plugins: [
    cspConnect(mode),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,webmanifest}'],
      },
      manifest: {
        name: 'משמעת אישית',
        short_name: 'משמעת',
        description: 'מעקב שבועי אחר הרגלים ומשקל',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f5f1',
        theme_color: '#2f6f5e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
