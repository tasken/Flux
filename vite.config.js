import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '192.168.1.3',
    port: 58707,
    open: false
  },
  optimizeDeps: {
    entries: ['index.html']
  }
})
