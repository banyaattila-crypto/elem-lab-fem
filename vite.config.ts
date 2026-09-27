import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Verzió + build-ID injektálás: a látható verziószám és a belső,
// minden buildnél frissülő build-ID (__APP_VERSION__ / __BUILD_ID__)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      cleanupOutdatedCaches: true,
      // A manifestet a public/manifest.webmanifest szolgáltatja (index.html hivatkozik rá)
      manifest: false,
      includeAssets: ['icons/icon.svg', 'icons/icon-maskable.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
