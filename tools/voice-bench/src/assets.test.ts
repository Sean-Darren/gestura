import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  verifySpeechAsset,
  SPEECH_FILES,
  SPEECH_ARCHIVE_SHA256
} from '../../../scripts/speech-assets.mjs'
it('pins upstream SHA-256 values and rejects modified asset bytes', () => {
  expect(SPEECH_ARCHIVE_SHA256).toHaveLength(64)
  expect(Object.keys(SPEECH_FILES)).toEqual(['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx'])
  const bytes = new Uint8Array([1, 2, 3])
  const digest = createHash('sha256').update(bytes).digest('hex')
  expect(() => verifySpeechAsset(bytes, digest)).not.toThrow()
  expect(() => verifySpeechAsset(new Uint8Array([1, 2, 4]), digest)).toThrow('SHA-256')
})
