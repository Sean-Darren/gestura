import { describe, expect, it } from 'vitest'
import { CalibrationProfileSchema, VisionDiagnosticsSchema } from './calibration'
import { createIpcEnvelope } from './index'
import {
  scriptedWizard,
  completeBlinkPhase,
  completeTargets
} from '../../pointer/src/calibration-fixture'
function profile(): ReturnType<typeof CalibrationProfileSchema.parse> {
  const s = scriptedWizard()
  completeBlinkPhase(s)
  completeTargets(s)
  return s.wizard.profile(s.time())
}
describe('calibration profile contracts', () => {
  it('round-trips a valid versioned JSON profile without media', () => {
    const p = profile()
    expect(CalibrationProfileSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p)
    expect(p.loggingEnabled).toBe(false)
  })
  it('rejects invalid versions, missing gaze fit, nonfinite coefficients and blink threshold overlap', () => {
    const p = profile()
    for (const invalid of [
      { ...p, version: 2 },
      { ...p, neutral: { yaw: NaN, pitch: 0 } },
      { ...p, gaze: { enabled: true, mapping: null } },
      {
        ...p,
        gaze: {
          enabled: false,
          mapping: {
            features: 'iris-offsets-head-v1',
            mean: Array(6).fill(0),
            scale: Array(6).fill(1),
            x: [NaN, 0, 0, 0, 0, 0, 0],
            y: Array(7).fill(0),
            rmse: 0,
            samples: 9
          }
        }
      },
      { ...p, blink: { ...p.blink, openScore: 0.9 } },
      { ...p, video: 'pixels' }
    ])
      expect(() => CalibrationProfileSchema.parse(invalid)).toThrow()
  })
  it('allows only scalar lighting diagnostics and narrow wizard commands', () => {
    expect(VisionDiagnosticsSchema.parse({ tCapture: 1, luminance: 0.5 })).toEqual({
      tCapture: 1,
      luminance: 0.5
    })
    expect(() =>
      VisionDiagnosticsSchema.parse({ tCapture: 1, luminance: 0.5, pixels: [] })
    ).toThrow()
    expect(
      createIpcEnvelope('calibration:control', { operation: 'gaze', enabled: true }).channel
    ).toBe('calibration:control')
  })
})
