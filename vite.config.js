import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        museum: fileURLToPath(new URL('./index.html', import.meta.url)),
        guardChallenge: fileURLToPath(new URL('./rock-paper-scissors-demo/index.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/phaser/')) return 'phaser';
          if (/\/react(?:-dom)?\//.test(id)) return 'react';
        },
      },
    },
  },
});
