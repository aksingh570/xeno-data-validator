import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/validate': 'http://localhost:3000',
      '/preview': 'http://localhost:3000',
      '/download': 'http://localhost:3000',
    }
  }
})
