import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Backend origin for the dev proxy. Override with VITE_PROXY_TARGET when the
// API is not on the default port (e.g. 8000 is already taken by another app).
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/media': { target: proxyTarget, changeOrigin: true },
      '/socket.io': { target: proxyTarget, changeOrigin: true, ws: true },
    },
  },
})