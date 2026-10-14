import { performance } from 'node:perf_hooks'
import type { NativeBridge } from './index'

export function latencyPercentiles(samples: number[]): { p50: number; p95: number } {
  if (samples.length === 0) throw new Error('No completed moveTo samples')
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number): number => {
    const sample = sorted[Math.ceil(sorted.length * p) - 1]
    if (sample === undefined) throw new Error('Missing latency sample')
    return sample
  }
  return { p50: percentile(0.5), p95: percentile(0.95) }
}

export async function benchmarkMoves(
  input: NativeBridge
): Promise<{ count: number; p50: number; p95: number }> {
  const point = input.getCursorPos()
  if (!point) throw new Error('Benchmark is paused')
  const samples: number[] = []
  for (let index = 0; index < 1_000; index++) {
    await new Promise<void>((resolve) => setImmediate(resolve))
    const start = performance.now()
    if (!input.moveTo(point.x, point.y)) throw new Error('Benchmark stopped by pause')
    samples.push((performance.now() - start) * 1_000)
  }
  return { count: samples.length, ...latencyPercentiles(samples) }
}
