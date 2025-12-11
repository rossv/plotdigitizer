import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  base:
    process.env.VITE_BASE_PATH ??
    process.env.BASE_URL ??
    (process.env.NODE_ENV === 'production' ? '/plotdigitizer/' : '/')
})
