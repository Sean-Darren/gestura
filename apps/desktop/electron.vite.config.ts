import { bundledUiCoverage } from './build/ui-coverage'
import { developmentCsp } from './build/dev-csp'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { bundleVisionAssets } from '../../scripts/model-assets.mjs'
import { bundleSpeechAssets } from '../../scripts/speech-assets.mjs'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    plugins: [
      bundledUiCoverage(resolve(appRoot, '../../docs/decisions/0003-ui-element-coverage.md')),
      {
        name: 'gestura-local-vision-assets',
        buildStart: async () => {
          try {
            await bundleVisionAssets()
            await bundleSpeechAssets()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const hint =
              'Run pnpm models:fetch from the repo root to download and bundle the required models, then restart the dev server.'
            console.warn(`[gestura-local-vision-assets] ${message}`)
            console.warn(`[gestura-local-vision-assets] ${hint}`)
          }
        }
      }
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(appRoot, 'src/main/index.ts'),
          speech: resolve(appRoot, 'src/utility/speech/index.ts'),
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
          '@gestura/intent',
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
    plugins: [react(), developmentCsp()],
    build: {
      rollupOptions: {
        input: {
          control: resolve(appRoot, 'src/renderer/control/index.html'),
          overlay: resolve(appRoot, 'src/renderer/overlay/index.html'),
          vision: resolve(appRoot, 'src/renderer/vision/index.html'),
          speech: resolve(appRoot, 'src/renderer/speech/index.html')
        }
      }
    }
  }
})
