import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseFixture, SessionLabelsSchema } from './index'

describe('checked-in synthetic fixture', () => {
  it('contains only valid derived frames and paired prompt times', async () => {
    const frames = parseFixture(
      await readFile(
        new URL('../../../fixtures/landmarks/p2.1-synthetic.jsonl', import.meta.url),
        'utf8'
      )
    )
    const labels = SessionLabelsSchema.parse(
      JSON.parse(
        await readFile(
          new URL('../../../fixtures/landmarks/p2.1-synthetic.labels.json', import.meta.url),
          'utf8'
        )
      )
    )
    expect(frames).toHaveLength(4)
    expect(frames[0]?.faceDetected).toBe(false)
    expect(frames[2]?.blendshapes.eyeBlinkLeft).toBe(0.9)
    expect(frames[3]?.blendshapes.jawOpen).toBe(0.8)
    expect(labels.sessionStart).toBe(frames[0]?.tCapture)
  })
})
