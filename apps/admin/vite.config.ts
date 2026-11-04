import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  // Bitta serverda: /admin/ (API web fayllarni beradi). Dev'da — /
  base: process.env.ADMIN_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3001,
    // Dev: API va socket bir xil origin orqali — CORS va cookie muammosiz
    proxy: {
      '/api': API,
      '/uploads': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
