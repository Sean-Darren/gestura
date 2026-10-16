import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['src/taskpane/taskpane.ts'],
  bundle: true,
  outfile: 'dist/taskpane.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info'
})

copyFileSync('src/taskpane/taskpane.html', 'dist/taskpane.html')
