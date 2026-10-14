import { describe, expect, it } from 'vitest'
import { fitRidge, predictGaze, irisFeatures } from './regression'
import { testFrame } from './test-frames'
describe('ridge gaze calibration', () => {
  it('recovers a known affine transform on synthetic data with constant head features', () => {
    const samples = Array.from({ length: 30 }, (_, i) => {
      const a = (i % 5) / 4 - 0.5,
        b = Math.floor(i / 5) / 5 - 0.5
      return {
        features: [a, b, a, b, 0, 0],
        target: { x: 0.5 + 0.6 * a + 0.1 * b, y: 0.5 + 0.1 * a + 0.6 * b }
      }
    })
    const mapping = fitRidge(samples)
    const p = predictGaze([0.2, -0.3, 0.2, -0.3, 0, 0], mapping)
    expect(p.x).toBeCloseTo(0.59, 3)
    expect(p.y).toBeCloseTo(0.34, 3)
    expect(mapping.rmse).toBeLessThan(0.001)
    expect(fitRidge(samples)).toEqual(mapping)
  })
  it('handles correlated features with ridge but rejects uninformative/invalid fits', () => {
    expect(() => fitRidge([])).toThrow()
    const samples = Array.from({ length: 9 }, (_, i) => ({
      features: [0, 0, 0, 0, 0, 0],
      target: { x: (i % 3) / 2, y: Math.floor(i / 3) / 2 }
    }))
    expect(() => fitRidge(samples)).toThrow(/unreliable/)
    expect(() => fitRidge(samples, 0)).toThrow()
    expect(() => fitRidge(samples.map((s) => ({ ...s, features: [NaN, 0, 0, 0, 0, 0] })))).toThrow()
  })
  it('rejects closed/degenerate eyes without exporting pixels', () => {
    const f = testFrame()
    expect(irisFeatures(f, { yaw: 0, pitch: 0 })).toBeUndefined()
    f.blendshapes.eyeBlinkLeft = 0.9
    expect(irisFeatures(f, { yaw: 0, pitch: 0 })).toBeUndefined()
  })
})
