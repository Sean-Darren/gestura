import { describe, expect, it } from 'vitest'
import { OneEuroFilter } from './one-euro'
const config = { minCutoff: 1, beta: 0, dCutoff: 1 }
describe('One Euro filter', () => {
  it('preserves a constant signal exactly', () => {
    const filter = new OneEuroFilter(config)
    for (let i = 0; i < 100; i++) expect(filter.filter(42, i * 10)).toBe(42)
  })
  it('matches the analytic low-pass step response at beta zero', () => {
    const filter = new OneEuroFilter(config)
    filter.filter(0, 0)
    const a = (2 * Math.PI * 0.1) / (1 + 2 * Math.PI * 0.1)
    for (let i = 1; i <= 10; i++)
      expect(filter.filter(1, i * 100)).toBeCloseTo(1 - (1 - a) ** i, 12)
  })
  it('matches the derivative-adaptive first ramp sample', () => {
    const filter = new OneEuroFilter({ ...config, beta: 0.1 })
    filter.filter(0, 0)
    const ad = (2 * Math.PI * 0.1) / (1 + 2 * Math.PI * 0.1)
    const cutoff = 1 + 0.1 * (10 * ad)
    expect(filter.filter(1, 100)).toBeCloseTo(
      (2 * Math.PI * cutoff * 0.1) / (1 + 2 * Math.PI * cutoff * 0.1),
      12
    )
  })
  it('suppresses alternating noise and responds faster with adaptive gain', () => {
    const slow = new OneEuroFilter(config),
      fast = new OneEuroFilter({ ...config, beta: 0.5 })
    slow.filter(0, 0)
    fast.filter(0, 0)
    expect(fast.filter(100, 16)).toBeGreaterThan(slow.filter(100, 16))
    const noise = new OneEuroFilter(config)
    const outputs = Array.from({ length: 120 }, (_, i) =>
      noise.filter(i % 2 ? 1 : -1, (i * 1000) / 60)
    ).slice(60)
    expect(Math.sqrt(outputs.reduce((sum, x) => sum + x * x, 0) / outputs.length)).toBeLessThan(0.1)
  })
  it('uses variable time steps, ignores non-increasing time and resets', () => {
    const f = new OneEuroFilter(config)
    expect(f.filter(10, 100)).toBe(10)
    expect(f.filter(100, 100)).toBe(10)
    expect(f.filter(100, 50)).toBe(10)
    expect(f.filter(20, 1100)).toBeCloseTo(10 + 10 * ((2 * Math.PI) / (1 + 2 * Math.PI)), 12)
    f.reset()
    expect(f.filter(-3, 0)).toBe(-3)
    expect(() => f.filter(NaN, 2)).toThrow()
    expect(() => new OneEuroFilter({ ...config, beta: -1 })).toThrow()
  })
})
