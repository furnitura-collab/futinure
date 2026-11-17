import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  // Bitta serverda: /admin/ (API web fayllarni beradi). Dev'da — /
  base: process.env.ADMIN_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Kutubxonalar alohida: ilova kodi yangilanganda brauzer ularni keshdan oladi
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 30 },
            { name: 'radix', test: /node_modules[\\/](radix-ui|@radix-ui|cmdk)[\\/]/, priority: 20 },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            { name: 'dnd', test: /node_modules[\\/]@dnd-kit[\\/]/, priority: 20 },
            { name: 'icons', test: /node_modules[\\/]@phosphor-icons[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
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
