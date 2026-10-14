import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let binding

export function loadNativeBinding() {
  if (binding) return binding
  const target = `${process.platform}-${process.arch}`
  if (!['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(target)) {
    throw new Error(`Unsupported Gestura native platform: ${target}`)
  }
  const path = fileURLToPath(new URL(`./prebuilds/gestura-native.${target}.node`, import.meta.url))
  try {
    binding = require(path)
    return binding
  } catch (cause) {
    throw new Error(
      `Cannot load the local ${target} addon. Run pnpm native:build or install its CI artifact.`,
      { cause }
    )
  }
}
