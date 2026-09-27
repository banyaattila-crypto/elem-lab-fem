import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
