import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { bundleVisionAssets } from '../../scripts/model-assets.mjs'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    plugins: [
      {
        name: 'gestura-local-vision-assets',
        buildStart: async () => {
          await bundleVisionAssets()
        }
      }
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(appRoot, 'src/main/index.ts'),
          'native-demo': resolve(appRoot, 'src/main/native/demo.ts'),
          'native-bench': resolve(appRoot, 'src/main/native/benchmark.ts'),
          'native-ui-probe': resolve(appRoot, 'src/main/native/ui-probe.ts')
        }
      },
      externalizeDeps: {
        exclude: [
          '@gestura/pointing-bench',
          '@gestura/core',
          '@gestura/replay',
          '@gestura/pointer',
          '@gestura/gestures',
          'zod'
        ]
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
