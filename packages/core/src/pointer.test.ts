import { describe, expect, it } from 'vitest'
import {
  CursorCommandSchema,
  PointerMetricsSchema,
  PointerProfileSchema,
  PointerDisplaySchema
} from './pointer'
import { createIpcEnvelope, parseIpcEnvelope } from './index'
describe('pointer contracts', () => {
  it('validates commands and the narrow pointer IPC controls', () => {
    expect(
      CursorCommandSchema.parse({
        x: 10,
        y: 20,
        kind: 'head',
        tCapture: 1,
        tInferDone: 2,
        tPointerDone: 3
      }).kind
    ).toBe('head')
    expect(() =>
      CursorCommandSchema.parse({
        x: 1,
        y: 1,
        kind: 'head',
        tCapture: 3,
        tInferDone: 2,
        tPointerDone: 1
      })
    ).toThrow()
    expect(createIpcEnvelope('pointer:control', { enabled: true }).payload).toEqual({
      enabled: true
    })
    expect(() =>
      parseIpcEnvelope({ channel: 'pointer:control', payload: { enabled: true, x: 100 }, t: 0 })
    ).toThrow()
    expect(() => PointerProfileSchema.parse({ neutral: { yaw: NaN, pitch: 0 } })).toThrow()
    expect(() =>
      PointerDisplaySchema.parse({
        bounds: { x: 0, y: 0, width: 0, height: 10 },
        scaleFactor: 1,
        coordinateSpace: 'pixels'
      })
    ).toThrow()
    expect(() =>
      PointerMetricsSchema.parse({ enabled: true, samples: 1, latencyP50Ms: -1 })
    ).toThrow()
  })
})
