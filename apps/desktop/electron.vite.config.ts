import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@gestura/core', 'zod']
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(appRoot, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(appRoot, 'src/renderer')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          control: resolve(appRoot, 'src/renderer/control/index.html'),
          overlay: resolve(appRoot, 'src/renderer/overlay/index.html'),
          vision: resolve(appRoot, 'src/renderer/vision/index.html')
        }
      }
    }
  }
})
