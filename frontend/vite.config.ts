import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET has no VITE_ prefix, so it is read here only and never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://localhost:8000'
  // Same-origin API calls: no CORS, and a phone on the LAN reaches the backend through this server.
  const proxy = {
    '/api': { target, changeOrigin: true },
    '/uploads': { target, changeOrigin: true },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { host: true, proxy },
    preview: { host: true, proxy },
    // The main chunk is the map stack (React + Leaflet) the home screen needs at once; secondary screens
    // and mocks are split out. Served over a LAN for the demo, so ~530 KB isn't worth more config.
    build: { chunkSizeWarningLimit: 650 },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Tests drive the mock backend. Pin it, so a live-mode frontend/.env.local can't fail them.
      env: { VITE_API_MODE: 'mock' },
    },
  }
})
