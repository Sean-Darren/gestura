import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, rename, rm, copyFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../', import.meta.url))
export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
export const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
export const VISION_VERSION = '0.10.32'
export function verifyVisionRuntime(version, source) {
  if (
    version !== VISION_VERSION ||
    /odml\.pa\.googleapis\.com|enableLogging|logSessionStart/.test(source)
  )
    throw new Error('MediaPipe runtime changed: review telemetry behavior before bundling')
}
export function verifyModel(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== MODEL_SHA256)
    throw new Error('Face Landmarker SHA-256 mismatch')
}
export async function fetchModel(fetcher = fetch, directory = resolve(repoRoot, 'models')) {
  await mkdir(directory, { recursive: true })
  const destination = resolve(directory, 'face_landmarker.task')
  try {
    verifyModel(await readFile(destination))
    return destination
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.message !== 'Face Landmarker SHA-256 mismatch')
      throw error
  }
  const response = await fetcher(MODEL_URL, {
    redirect: 'error',
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  verifyModel(bytes)
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return destination
}
export async function bundleVisionAssets(
  destination = resolve(repoRoot, 'apps/desktop/resources/vision')
) {
  const bytes = await readFile(resolve(repoRoot, 'models/face_landmarker.task')).catch(() => {
    throw new Error('Missing local model: run pnpm models:fetch first')
  })
  verifyModel(bytes)
  const require = createRequire(resolve(repoRoot, 'apps/desktop/package.json'))
  const packageRoot = dirname(require.resolve('@mediapipe/tasks-vision'))
  const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  const runtime = await readFile(require.resolve('@mediapipe/tasks-vision'), 'utf8')
  verifyVisionRuntime(metadata.version, runtime)
  const wasm = resolve(packageRoot, 'wasm')
  const files = (await readdir(wasm)).filter((name) => /^vision_wasm.*\.(js|wasm)$/.test(name))
  if (!files.some((name) => name.endsWith('.wasm')) || !files.some((name) => name.endsWith('.js')))
    throw new Error('MediaPipe WASM files missing')
  await mkdir(resolve(destination, 'wasm'), { recursive: true })
  for (const name of await readdir(resolve(destination, 'wasm')))
    await rm(resolve(destination, 'wasm', name))
  for (const name of files) await copyFile(resolve(wasm, name), resolve(destination, 'wasm', name))
  await writeFile(resolve(destination, 'face_landmarker.task'), bytes)
}
