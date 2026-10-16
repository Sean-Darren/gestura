import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, mkdtemp, rm, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repoRoot } from './model-assets.mjs'

export const SPEECH_EXPORT = 'sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17'
export const SPEECH_ARCHIVE_SHA256 =
  '257936ea9a64cbe33200274e6367fc26d373ff6ca58b996b15108ffd6b9f6148'
const base = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'
export const SPEECH_FILES = {
  'model.int8.onnx': '9dc6e72aa8bc6f5966cf2857a0ce3a425b1d72e91500e147d66329f407c017a1',
  'tokens.txt': '2db4bb25d046e8849e336c9465e248e1694914d996c58c71bdeca18cfb722992',
  'silero_vad.onnx': '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6'
}
export const SPEECH_SAMPLES = {
  'en.wav': '33163bf101abe508ec5b98cfd10594f8a96d168c28754505c2b6bd57f6599672',
  'zh.wav': 'c0e13539aeee0c6f0f94fb19ed09525d7a640b8ef08f8c3971b1b8d63bdb7cf7',
  'yue.wav': '19b95161284cfd8eae05bc556ccaad0c5e0cb77e763b37b751773749224d6372',
  'ja.wav': '469240211260fa208167152d42f38202de31c43626ab70bf40adeb0dc685f7f8',
  'ko.wav': 'e952a5dd203ddfbd37a6e9d080d38de8e00e27a2e436ad0706cd53ada6dcbb78'
}
export function verifySpeechAsset(bytes, hash) {
  if (createHash('sha256').update(bytes).digest('hex') !== hash)
    throw new Error('Speech asset SHA-256 mismatch')
}
async function valid(path, hash) {
  try {
    verifySpeechAsset(await readFile(path), hash)
    return true
  } catch {
    return false
  }
}
async function download(url, hash) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
  if (!response.ok) throw new Error(`Speech download failed: ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  verifySpeechAsset(bytes, hash)
  return bytes
}
export async function fetchSpeechAssets() {
  const destination = resolve(repoRoot, 'models/speech')
  const samples = resolve(repoRoot, 'fixtures/audio/sherpa')
  await mkdir(destination, { recursive: true })
  await mkdir(samples, { recursive: true })
  const complete = await Promise.all([
    ...Object.entries(SPEECH_FILES).map(([name, hash]) => valid(resolve(destination, name), hash)),
    ...Object.entries(SPEECH_SAMPLES).map(([name, hash]) => valid(resolve(samples, name), hash))
  ])
  if (complete.every(Boolean)) return
  const temporary = await mkdtemp(resolve(destination, '.fetch-'))
  try {
    const archive = resolve(temporary, 'model.tar.bz2')
    await writeFile(
      archive,
      await download(`${base}${SPEECH_EXPORT}.tar.bz2`, SPEECH_ARCHIVE_SHA256)
    )
    // Only known members of the checksum-pinned upstream archive are extracted.
    await promisify(execFile)('tar', [
      '-xjf',
      archive,
      '-C',
      temporary,
      `${SPEECH_EXPORT}/model.int8.onnx`,
      `${SPEECH_EXPORT}/tokens.txt`,
      ...Object.keys(SPEECH_SAMPLES).map((name) => `${SPEECH_EXPORT}/test_wavs/${name}`)
    ])
    for (const name of ['model.int8.onnx', 'tokens.txt']) {
      const source = resolve(temporary, SPEECH_EXPORT, name)
      verifySpeechAsset(await readFile(source), SPEECH_FILES[name])
      await copyFile(source, resolve(destination, name))
    }
    for (const [name, hash] of Object.entries(SPEECH_SAMPLES)) {
      const source = resolve(temporary, SPEECH_EXPORT, 'test_wavs', name)
      verifySpeechAsset(await readFile(source), hash)
      await copyFile(source, resolve(samples, name))
    }
    await writeFile(
      resolve(destination, 'silero_vad.onnx'),
      await download(`${base}silero_vad.onnx`, SPEECH_FILES['silero_vad.onnx'])
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
export async function bundleSpeechAssets(
  destination = resolve(repoRoot, 'apps/desktop/resources/speech')
) {
  await mkdir(destination, { recursive: true })
  for (const [name, hash] of Object.entries(SPEECH_FILES)) {
    const source = resolve(repoRoot, 'models/speech', name)
    const bytes = await readFile(source).catch(() => {
      throw new Error('Missing speech models: run pnpm models:fetch')
    })
    verifySpeechAsset(bytes, hash)
    await writeFile(resolve(destination, name), bytes)
  }
}
