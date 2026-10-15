import { describe, expect, it } from 'vitest'
import { EarBaselineSchema, GestureEventSchema, GestureControlSchema } from './gestures'
import { GestureConfigSchema, DEFAULT_GESTURE_CONFIG } from './config'
import { createIpcEnvelope } from './index'
describe('gesture contracts', () => {
  it('defaults off and rejects invalid thresholds and dwell timing', () => {
    expect(DEFAULT_GESTURE_CONFIG.mode).toBe('off')
    for (const patch of [
      { jawOpenScore: 0.3, jawCloseScore: 0.4 },
      { earOpenRatio: 0.4, earClosedRatio: 0.6 },
      { winkMinMs: 249 },
      { jawHoldMs: 799 },
      { dwellMs: 0 },
      { maxLongBlinkMs: 399 }
    ])
      expect(GestureConfigSchema.safeParse(patch).success).toBe(false)
  })
  it('keeps gesture controls narrow and cannot turn a click into confirmation', () => {
    expect(createIpcEnvelope('gestures:control', { mode: 'blink' }).channel).toBe(
      'gestures:control'
    )
    expect(createIpcEnvelope('system:toggle-pause', {}).channel).toBe('system:toggle-pause')
    expect(GestureControlSchema.safeParse({ mode: 'confirm' }).success).toBe(false)
    expect(GestureControlSchema.safeParse({ mode: 'blink', confirm: true }).success).toBe(false)
    expect(GestureEventSchema.safeParse({ kind: 'confirm', t: 1 }).success).toBe(false)
    expect(
      GestureEventSchema.safeParse({
        kind: 'click',
        button: 'left',
        source: 'dwell',
        x: NaN,
        y: 0,
        t: 1
      }).success
    ).toBe(false)
  })
  it('requires positive calibrated eye ratios and a hysteresis gap', () => {
    const ear = { left: 0.3, right: 0.32, aspectRatio: 16 / 9, closedRatio: 0.45, openRatio: 0.75 }
    expect(EarBaselineSchema.parse(ear)).toEqual(ear)
    expect(EarBaselineSchema.safeParse({ ...ear, left: 0 }).success).toBe(false)
    expect(EarBaselineSchema.safeParse({ ...ear, closedRatio: 0.7, openRatio: 0.6 }).success).toBe(
      false
    )
  })
})
