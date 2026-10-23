import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Emits sw.js with this build's file list and version, so the service
// worker pre-downloads every page of the app (the till works offline even
// on screens not opened yet) and each deploy replaces the old copy.
function serviceWorker() {
  return {
    name: 'stockdesk-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2?|png|svg|webp|ico)$/.test(file))
        // The Excel library (~1 MB) is only for import/export, which need
        // the internet anyway.
        .filter((file) => !/exceljs/i.test(file))
        .sort();
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__CACHE_VERSION__', version)
          .replace('__PRECACHE_FILES__', JSON.stringify(files.map((file) => `/${file}`))),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
});
