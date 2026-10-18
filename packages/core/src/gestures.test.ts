import { describe, expect, it } from 'vitest'
import {
  EarBaselineSchema,
  GestureEventSchema,
  GestureControlSchema,
  GestureDiagnosticsSchema
} from './gestures'
import { GestureConfigSchema, DEFAULT_GESTURE_CONFIG } from './config'
import { createIpcEnvelope } from './index'
describe('gesture contracts', () => {
  it('accepts the selected right-wink source and rejects the former left-wink mapping', () => {
    const click = { kind: 'click', button: 'right', source: 'right-wink', x: 1, y: 2, t: 0 }
    expect(GestureEventSchema.safeParse(click).success).toBe(true)
    expect(GestureEventSchema.safeParse({ ...click, source: 'left-wink' }).success).toBe(false)
  })
  it('validates diagnostics through the existing narrow overlay IPC channel', () => {
    const diagnostics = {
      detection: {
        left: 'open',
        right: 'closed',
        phase: 'tracking',
        reason: 'ready',
        durationMs: 350,
        minLongBlinkMs: 600,
        maxLongBlinkMs: 1500,
        winkMinMs: 250,
        closedScore: 0.6,
        openScore: 0.3
      },
      detectedClicks: 1,
      sentClicks: 0,
      delivery: 'failed',
      deliveryMessage: 'Native input failed'
    }
    const parsed = GestureDiagnosticsSchema.parse(diagnostics)
    expect(
      createIpcEnvelope('gestures:state', {
        mode: 'blink',
        paused: false,
        frozen: true,
        dwellProgress: 0,
        pauseProgress: 0,
        cursor: null,
        click: null,
        message: '',
        width: 1280,
        height: 720,
        pauseTargetSize: 72,
        gestureDiagnostics: parsed
      }).channel
    ).toBe('gestures:state')
    expect(GestureDiagnosticsSchema.safeParse({ ...parsed, sentClicks: -1 }).success).toBe(false)
    expect(GestureDiagnosticsSchema.safeParse({ ...parsed, samples: [] }).success).toBe(false)
    expect(
      GestureDiagnosticsSchema.safeParse({
        ...parsed,
        detection: { ...parsed.detection, reason: 'guess' }
      }).success
    ).toBe(false)
  })
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
