import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    open: false
  },
  optimizeDeps: {
    entries: ['index.html']
  }
})
