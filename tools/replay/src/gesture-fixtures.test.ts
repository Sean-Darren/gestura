import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { GestureEngine } from '../../../packages/gestures/src/index'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import { parseFixture, SessionLabelsSchema } from './index'
import type { GestureEvent } from '@gestura/core'
describe('labelled synthetic gesture replay (not human accuracy)', () => {
  it('reports long-blink recall, natural/reading/talking clicks and left-wink detection', async () => {
    const root = new URL('../../../fixtures/landmarks/p2.4-gestures-synthetic', import.meta.url)
    const frames = parseFixture(await readFile(new URL(`${root.href}.jsonl`), 'utf8'))
    const labels = SessionLabelsSchema.parse(
      JSON.parse(await readFile(new URL(`${root.href}.labels.json`), 'utf8'))
    )
    const engine = new GestureEngine(
      {
        closedScore: 0.6,
        openScore: 0.3,
        minLongBlinkMs: 400,
        naturalMaxMs: 150,
        deliberateMs: [600, 600, 600],
        naturalObservationMs: 10000
      },
      { ...DEFAULT_GESTURE_CONFIG, mode: 'blink' }
    )
    const events: GestureEvent[] = []
    for (const frame of frames) events.push(...engine.update(frame, { x: 500, y: 300 }, 0).events)
    const count = (name: string, kind: 'click' | 'wink'): number =>
      labels.prompts
        .filter((p) => p.prompt === name)
        .reduce(
          (sum, p) =>
            sum + events.filter((e) => e.kind === kind && e.t >= p.start && e.t < p.end).length,
          0
        )
    const long = count('Deliberate long blink', 'click'),
      wink = count('Wink left', 'wink')
    const rate = (name: string): number =>
      (count(name, 'click') * 60000) /
      labels.prompts.filter((p) => p.prompt === name).reduce((sum, p) => sum + p.end - p.start, 0)
    console.table([
      { metric: 'Long-blink recall (synthetic)', value: `${long}/5 = ${long * 20}%` },
      { metric: 'Natural clicks/min (synthetic)', value: rate('Natural blinking') },
      { metric: 'Reading clicks/min (synthetic)', value: rate('Reading silently') },
      { metric: 'Talking clicks (synthetic)', value: count('Reading aloud / talking', 'click') },
      { metric: 'Left-wink detection (synthetic)', value: `${wink}/5 = ${wink * 20}%` }
    ])
    expect(events.filter((e) => e.kind === 'click')).toHaveLength(10)
    expect(long / 5).toBeGreaterThanOrEqual(0.95)
    expect(wink).toBe(5)
    expect(rate('Natural blinking')).toBe(0)
    expect(rate('Reading silently')).toBe(0)
    expect(count('Reading aloud / talking', 'click')).toBe(0)
  })
})
