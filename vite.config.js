import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Ganti 'ar-album-hologram' dengan nama repo GitHub kamu
const REPO_NAME = 'ar-album-hologram'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(), // HTTPS self-signed cert → kamera HP bisa jalan via LAN
  ],
  base: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : '/',
  server: {
    host: true,   // expose ke LAN (0.0.0.0)
    port: 5173,
    https: true,  // aktifkan HTTPS
  },
  optimizeDeps: {
    exclude: ['mind-ar'],
  },
  build: {
    chunkSizeWarningLimit: 3000, // mind-ar memang besar, suppress warning
  },
})
