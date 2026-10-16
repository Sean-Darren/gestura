import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { MouthHold } from '../../../packages/gestures/src/mouth-hold'
import { parseFixture } from './index'
describe('mouth hold replay', () => {
  it('never treats the existing labelled blink/wink/reading/talking fixture as confirmation or listening toggles', async () => {
    const frames = parseFixture(
      await readFile(
        new URL('../../../fixtures/landmarks/p2.4-gestures-synthetic.jsonl', import.meta.url),
        'utf8'
      )
    )
    for (const duration of [800, 1000]) {
      const hold = new MouthHold()
      const events = frames.filter(
        (frame) =>
          hold.update(frame.tCapture, frame.blendshapes.jawOpen, frame.faceDetected, duration).fired
      )
      expect(
        events,
        `Unexpected ${duration}ms holds in synthetic reading/talking fixture`
      ).toHaveLength(0)
    }
  })
})
