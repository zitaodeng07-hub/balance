import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'ios >= 11'],
      modernPolyfills: true,
    }),
  ],
  build: {
    target: ['es2018', 'safari13'],
    cssTarget: 'safari13',
  },
});
