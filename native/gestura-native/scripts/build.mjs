import { spawnSync } from 'node:child_process'
import { mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const targets = {
  'aarch64-apple-darwin': { name: 'darwin-arm64', library: 'libgestura_native.dylib' },
  'x86_64-apple-darwin': { name: 'darwin-x64', library: 'libgestura_native.dylib' },
  'x86_64-pc-windows-msvc': { name: 'win32-x64', library: 'gestura_native.dll' }
}
const host = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc'
}
const target = process.argv[2] ?? host[`${process.platform}-${process.arch}`]
const metadata = targets[target]
if (!metadata) throw new Error(`Unsupported native build target: ${target}`)
const result = spawnSync(
  'cargo',
  [
    'build',
    '--manifest-path',
    resolve(root, 'Cargo.toml'),
    '--locked',
    '--release',
    '--target',
    target,
    '--target-dir',
    resolve(root, 'target')
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(target === 'x86_64-pc-windows-msvc'
        ? { RUSTFLAGS: `${process.env.RUSTFLAGS ?? ''} -C target-feature=+crt-static` }
        : {})
    }
  }
)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
mkdirSync(resolve(root, 'prebuilds'), { recursive: true })
const destination = resolve(root, 'prebuilds', `gestura-native.${metadata.name}.node`)
copyFileSync(resolve(root, 'target', target, 'release', metadata.library), destination)
console.log(`Built ${destination}`)
