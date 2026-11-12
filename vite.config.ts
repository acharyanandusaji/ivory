import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'models/*.bin', 'models/*.json'],
      manifest: {
        name: 'Ivory — Private Photo Curation',
        short_name: 'Ivory',
        description: 'Local-first AI photo curation for weddings and events. Your photographs never leave your device.',
        theme_color: '#12110f',
        background_color: '#faf9f6',
        display: 'standalone',
        orientation: 'landscape-primary',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,json,bin,wasm,mjs}'],
        // ONNX Runtime is only needed for the optional CLIP visual search, so
        // fetch it on demand instead of blocking the first PWA install with a
        // ~30 MB download. Core app assets and face models stay precached.
        globIgnores: ['**/ort/**', '**/ort-wasm*'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/ort-wasm[^/]*\.(?:wasm|mjs)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ivory-ort-assets',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs\.huggingface\.co|cdn-lfs\.hf\.co|cdn\.jsdelivr\.net)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ivory-model-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});
