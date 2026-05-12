import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: ['es2018', 'safari13'],
    cssTarget: 'safari13',
  },
});
