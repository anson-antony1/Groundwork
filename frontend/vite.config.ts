import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const CARD_TITLE = 'Groundwork: which sites can crews reach tomorrow?'
const CARD_TEXT = 'Weather safety for every vehicle, ground access for each one, and a ranked plan before the 6 PM call. SwampHacks XII prototype.'

/**
 * Social-card tags (public/og.png) for the public builds. Crawlers need absolute URLs, so the tags are
 * added only when the build knows its address: VITE_PUBLIC_URL, or RENDER_EXTERNAL_URL on Render.
 */
function socialCard(publicUrl: string | undefined): Plugin {
  return {
    name: 'groundwork-social-card',
    transformIndexHtml(html) {
      const url = publicUrl?.trim().replace(/\/+$/, '')
      if (!url || !/^https?:\/\/\S+$/.test(url)) return html
      const tags = [
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Groundwork" />',
        `<meta property="og:title" content="${CARD_TITLE}" />`,
        `<meta property="og:description" content="${CARD_TEXT}" />`,
        `<meta property="og:url" content="${url}/welcome" />`,
        `<meta property="og:image" content="${url}/og.png" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta name="twitter:card" content="summary_large_image" />',
      ]
      return html.replace('</head>', `  ${tags.join('\n    ')}\n  </head>`)
    },
  }
}

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
    plugins: [react(), tailwindcss(), socialCard(env.VITE_PUBLIC_URL || env.RENDER_EXTERNAL_URL)],
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
