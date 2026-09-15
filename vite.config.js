import { defineConfig } from 'vite';
import { pwaServiceWorker } from './scripts/pwa-sw-plugin.js';

export default defineConfig({
  plugins: [pwaServiceWorker()],
});
