import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { saveRecording, loadRecording } from './replay-files'
import { ScriptedRecorder } from '@gestura/replay'
describe('local fixture files', () => {
  it('writes JSONL and labels together without overwriting existing fixtures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gestura-fixture-'))
    try {
      const recorder = new ScriptedRecorder(0, 1000, ['Synthetic prompt'])
      recorder.append({
        tCapture: 0,
        tInferDone: 5,
        faceDetected: false,
        landmarks: new Float32Array(1434),
        matrix: new Float32Array(16),
        blendshapes: {}
      })
      const session = recorder.finish(1000)
      await saveRecording(directory, session)
      expect(await loadRecording(join(directory, 'frames.jsonl'))).toHaveLength(1)
      expect(
        JSON.parse(await readFile(join(directory, 'labels.json'), 'utf8')).prompts[0].prompt
      ).toBe('Synthetic prompt')
      await expect(saveRecording(directory, session)).rejects.toThrow()
      expect(await loadRecording(join(directory, 'frames.jsonl'))).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
