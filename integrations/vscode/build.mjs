import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
await build({
  entryPoints: ['src/extension.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  target: 'node22',
  sourcemap: false
})

// The workspace keeps its scoped pnpm name; VS Code needs an unscoped manifest.
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const {
  displayName,
  description,
  version,
  publisher,
  engines,
  activationEvents,
  extensionKind,
  capabilities,
  contributes
} = pkg
await writeFile(
  'dist/package.json',
  JSON.stringify(
    {
      name: 'gestura',
      displayName,
      description,
      version,
      publisher,
      engines,
      main: './extension.js',
      activationEvents,
      extensionKind,
      capabilities,
      contributes
    },
    null,
    2
  ) + '\n'
)
