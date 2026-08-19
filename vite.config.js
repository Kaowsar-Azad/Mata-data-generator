import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react()
    // Obfuscator temporarily disabled for debugging white screen
    // obfuscator({ ... })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      }
    }
  }
})
