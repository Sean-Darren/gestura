import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { headPose, mapToScreen, physicalBounds } from './pose'
import { rotation } from './test-frames'
const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  coordinateSpace: 'pixels' as const
}
const profile = { neutral: { yaw: 2, pitch: -3 } }
describe('head pose and screen mapping', () => {
  it('maps calibrated asymmetric comfortable ranges to all screen edges', () => {
    const p = { neutral: { yaw: 2, pitch: -3 }, range: { left: 8, right: 12, up: 6, down: 10 } }
    expect(mapToScreen({ yaw: -6, pitch: -3 }, p, display).x).toBe(0)
    expect(mapToScreen({ yaw: 14, pitch: -3 }, p, display).x).toBe(1919)
    expect(mapToScreen({ yaw: 2, pitch: -9 }, p, display).y).toBe(0)
    expect(mapToScreen({ yaw: 2, pitch: 7 }, p, display).y).toBe(1079)
  })

  it('extracts signed yaw/pitch from column-major rotations including combined angles', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [25, 20],
      [-25, -20],
      [12, -9]
    ]) {
      const result = headPose(rotation(yaw!, pitch!))
      expect(result.yaw).toBeCloseTo(yaw!, 5)
      expect(result.pitch).toBeCloseTo(pitch!, 5)
    }
  })
  it('ignores translation and independent axis scales', () => {
    const matrix = rotation(12, 8)
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++) matrix[c * 4 + r] = matrix[c * 4 + r]! * (c + 2)
    matrix[12] = 100
    matrix[13] = -250
    expect(headPose(matrix).yaw).toBeCloseTo(12, 5)
    expect(headPose(matrix).pitch).toBeCloseTo(8, 5)
  })
  it('rejects malformed, nonfinite and degenerate matrices', () => {
    expect(() => headPose(new Float32Array(15))).toThrow()
    expect(() => headPose(new Float32Array(16))).toThrow()
    const invalid = rotation(0, 0)
    invalid[3] = NaN
    expect(() => headPose(invalid)).toThrow()
  })
  it('subtracts neutral offset, holds inside the dead zone and clamps all edges', () => {
    const center = { x: 959.5, y: 539.5 }
    expect(mapToScreen(profile.neutral, profile, display)).toEqual(center)
    expect(mapToScreen({ yaw: 2.5, pitch: -3.5 }, profile, display)).toEqual(center)
    expect(mapToScreen({ yaw: 90, pitch: 90 }, profile, display)).toEqual({ x: 1919, y: 1079 })
    expect(mapToScreen({ yaw: -90, pitch: -90 }, profile, display)).toEqual({ x: 0, y: 0 })
  })
  it('has lower gain near center and higher gain for travel', () => {
    const x = (yaw: number): number =>
      mapToScreen({ yaw, pitch: 0 }, { neutral: { yaw: 0, pitch: 0 } }, display).x
    expect(x(21) - x(20)).toBeGreaterThan(x(2) - x(1))
    expect(DEFAULT_POINTER_CONFIG.centerGain).toBeLessThan(1)
  })
  it('scales Retina points and handles negative origins without scaling Windows pixels twice', () => {
    const retina = {
      ...display,
      bounds: { x: -100, y: 20, width: 1000, height: 700 },
      scaleFactor: 2,
      coordinateSpace: 'points' as const
    }
    expect(physicalBounds(retina)).toEqual({ x: -200, y: 40, width: 2000, height: 1400 })
    expect(physicalBounds({ ...retina, coordinateSpace: 'pixels' })).toEqual(retina.bounds)
  })
})
