import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base:
    process.env.VITE_BASE_PATH ??
    process.env.BASE_URL ??
    '/'
})
