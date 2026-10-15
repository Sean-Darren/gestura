import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fetchModel,
  MODEL_URL,
  MODEL_SHA256,
  verifyModel,
  bundleVisionAssets,
  verifyVisionRuntime,
  VISION_VERSION
} from '../../../scripts/model-assets.mjs'

describe('development-only model assets', () => {
  it('rejects changed SDK versions and known automatic telemetry entrypoints', () => {
    expect(() => verifyVisionRuntime(VISION_VERSION, 'local model loader')).not.toThrow()
    expect(() => verifyVisionRuntime('1.1.0', 'local model loader')).toThrow('review telemetry')
    expect(() =>
      verifyVisionRuntime(VISION_VERSION, 'https://odml.pa.googleapis.com/v1/log')
    ).toThrow('review telemetry')
    expect(() => verifyVisionRuntime(VISION_VERSION, 'enableLogging')).toThrow('review telemetry')
  })
  it('pins a versioned Google URL and SHA-256 and rejects corrupted bytes', () => {
    expect(MODEL_URL).toContain('/float16/1/face_landmarker.task')
    expect(MODEL_SHA256).toMatch(/^[a-f0-9]{64}$/)
    expect(() => verifyModel(new Uint8Array([1, 2, 3]))).toThrow('SHA-256')
  })
  it('rejects bad downloads before replacing an existing model', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gestura-model-'))
    try {
      const path = join(directory, 'face_landmarker.task')
      await writeFile(path, 'old-invalid-model')
      await expect(
        fetchModel(async () => new Response(new Uint8Array([1, 2, 3])), directory)
      ).rejects.toThrow('SHA-256')
      expect(await readFile(path, 'utf8')).toBe('old-invalid-model')
      await expect(
        fetchModel(async () => new Response('', { status: 500 }), directory)
      ).rejects.toThrow('500')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('exports asset bundling without a runtime downloader', () => {
    expect(typeof bundleVisionAssets).toBe('function')
  })
})
