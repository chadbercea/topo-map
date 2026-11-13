/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Served at /game/ next to the HTML prototypes on Vercel.
  base: '/game/',
  plugins: [
    react(),
    // An installable, offline war room (ILI-1335): a manifest and the rook icons, and a service
    // worker that keeps the game's build on the device. It's registered by the game only
    // (src/pwa.ts); a new build waits and takes over on the next launch, never mid-mission.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        id: '/game/',
        name: 'PMC War Room',
        short_name: 'War Room',
        description: 'Run a private military team from the war room.',
        start_url: '/game/',
        scope: '/game/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0b0f0d',
        theme_color: '#0b0f0d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The game and what it loads: its JS, CSS, fonts, icons. Phaser and Three.js are big.
        globPatterns: ['index.html', 'assets/**/*.{js,css,woff,woff2}', 'icons/*.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/game/index.html',
        navigateFallbackAllowlist: [/^\/game\/?(\?.*)?$/], // only the game's own page; not the site, design system or reviews
        cleanupOutdatedCaches: true,
      },
    }),
    // The manifest is the game's alone: the Castle House site and the design system aren't apps.
    {
      name: 'manifest-for-the-game-only',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) => (/(castle-house|design)\/index\.html$/.test(ctx.filename) ? html.replace(/<link rel="manifest"[^>]*>/g, '') : html),
      },
    },
  ],
  test: { include: ['src/**/*.test.ts'] },
  build: {
    // Phaser is one large module; keep it in its own chunk so app code stays small.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // The game, and its design system at /game/design/ (ILI-1324).
      input: { main: 'index.html', design: 'design/index.html', site: 'castle-house/index.html' },
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
});
