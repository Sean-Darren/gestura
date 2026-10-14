import type { PointerConfig } from '@gestura/core/config'

function alpha(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt
  return r / (r + 1)
}
/** Timestamps are milliseconds; derivatives are units per second. */
export class OneEuroFilter {
  private time: number | undefined
  private raw = 0
  private value = 0
  private derivative = 0
  constructor(private readonly config: Pick<PointerConfig, 'minCutoff' | 'beta' | 'dCutoff'>) {
    if (
      !Number.isFinite(config.minCutoff) ||
      config.minCutoff <= 0 ||
      !Number.isFinite(config.beta) ||
      config.beta < 0 ||
      !Number.isFinite(config.dCutoff) ||
      config.dCutoff <= 0
    )
      throw new Error('Invalid filter configuration')
  }
  reset(): void {
    this.time = undefined
    this.derivative = 0
  }
  filter(value: number, timeMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timeMs))
      throw new Error('Nonfinite filter sample')
    if (this.time === undefined) {
      this.time = timeMs
      this.raw = value
      this.value = value
      return value
    }
    if (timeMs <= this.time) return this.value
    const dt = (timeMs - this.time) / 1000
    const aDerivative = alpha(this.config.dCutoff, dt)
    this.derivative += aDerivative * ((value - this.raw) / dt - this.derivative)
    const a = alpha(this.config.minCutoff + this.config.beta * Math.abs(this.derivative), dt)
    this.value += a * (value - this.value)
    this.time = timeMs
    this.raw = value
    return this.value
  }
}
