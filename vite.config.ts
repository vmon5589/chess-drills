import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works at any URL, e.g. <user>.github.io/<repo>/.
  base: './',
  plugins: [react()],
})
