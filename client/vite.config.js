import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/xeno-data-validator/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
