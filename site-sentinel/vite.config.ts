import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // credentialless allows SharedArrayBuffer (needed if ORT uses threads)
      // without blocking cross-origin resources like Spline/Google Fonts.
      // This is safer than 'require-corp' which would block the Hero3D scene.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
