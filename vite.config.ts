import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// APP_VERSION est fixé par la fabrication automatique (ex. 1.0.12) ; sinon la version du package.json
const version = process.env.APP_VERSION || pkg.version

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
