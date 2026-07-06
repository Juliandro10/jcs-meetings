import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const electronMainExternals = [
  'sql.js',
  'meeting-schedules-parser',
  'meeting-schedules-parser/dist/node/index.js',
  'jszip',
  'pako',
  'pdf-parse',
  'pdf-lib',
  'word-extractor',
  'node-html-parser',
];

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: electronMainExternals,
            },
          },
          plugins: [
            {
              name: 'copy-elder-browser-preload',
              closeBundle() {
                const src = path.resolve(__dirname, 'electron/jw-elder-browser-preload.mjs');
                const dest = path.resolve(__dirname, 'dist-electron/jw-elder-browser-preload.mjs');
                fs.copyFileSync(src, dest);
              },
            },
          ],
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
