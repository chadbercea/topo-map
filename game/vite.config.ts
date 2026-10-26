import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served at /game/ next to the HTML prototypes on Vercel.
  base: '/game/',
  plugins: [react()],
  build: {
    // Phaser is one large module; keep it in its own chunk so app code stays small.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
});
