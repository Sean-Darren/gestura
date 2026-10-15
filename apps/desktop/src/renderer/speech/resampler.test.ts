import { expect, it } from 'vitest'
import { MonoResampler } from './resampler'
function signal(rate: number, hz: number): number[] {
  const result: number[] = []
  const sampler = new MonoResampler(rate, (chunk) => result.push(...chunk))
  for (let offset = 0; offset < rate; offset += 128) {
    const input = Float32Array.from({ length: Math.min(128, rate - offset) }, (_, i) =>
      Math.sin((2 * Math.PI * hz * (offset + i)) / rate)
    )
    sampler.push([input, input])
  }
  return result
}
it('resamples 48 kHz and 44.1 kHz to mono 16 kHz in 512-sample blocks', () => {
  for (const rate of [48000, 44100]) {
    const result = signal(rate, 1000)
    expect(result.length).toBe(15872)
    expect(Math.sqrt(result.reduce((s, x) => s + x * x, 0) / result.length)).toBeCloseTo(
      Math.SQRT1_2,
      2
    )
    expect(result.filter((v, i) => i > 0 && v >= 0 && result[i - 1]! < 0).length).toBeGreaterThan(
      980
    )
  }
})
it('rejects aliasing, clips finite samples and mixes opposite stereo channels', () => {
  const result = signal(48000, 12000)
  expect(Math.sqrt(result.reduce((s, x) => s + x * x, 0) / result.length)).toBeLessThan(0.02)
  const mixed: number[] = []
  const sampler = new MonoResampler(48000, (x) => mixed.push(...x))
  for (let i = 0; i < 20; i++)
    sampler.push([new Float32Array(128).fill(1), new Float32Array(128).fill(-1)])
  expect(mixed.every((x) => x === 0)).toBe(true)
  expect(() => new MonoResampler(0, () => {})).toThrow()
})
