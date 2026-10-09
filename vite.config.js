import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      usePolling: true,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const nid = id.replace(/\\/g, '/')
          if (nid.includes('node_modules/exceljs')) {
            return 'vendor-excel'
          }
          if (nid.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          if (
            nid.includes('node_modules/react/') ||
            nid.includes('node_modules/react-dom/') ||
            nid.includes('node_modules/react-router/') ||
            nid.includes('node_modules/react-router-dom/') ||
            nid.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    pool: 'vmThreads',
  },
})
