import { defineConfig } from 'vite';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pipeRoomEntry = new URL('./Pipe_Room_demo_v1/index.html', import.meta.url);

export default defineConfig({
  base: './',
  plugins: [{
    name: 'pipe-room-assets',
    async writeBundle({ dir }) {
      // The manifest and its sprite paths are loaded at runtime by the pipe room.
      await cp(new URL('./assets/', pipeRoomEntry), resolve(dir, 'Pipe_Room_demo_v1/assets'), { recursive: true });
    },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        museum: fileURLToPath(new URL('./index.html', import.meta.url)),
        pipeRoom: fileURLToPath(pipeRoomEntry),
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
