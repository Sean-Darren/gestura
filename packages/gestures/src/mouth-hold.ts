/** A fresh close-then-hold sequence; microphone-off mode uses visual stability only. */
export class MouthHold {
  constructor(private readonly thresholds = { open: 0.6, close: 0.3 }) {}
  private closed = false
  private since: number | undefined
  private reference = 0
  private last = -Infinity
  private latched = false
  reset(): void {
    this.closed = false
    this.since = undefined
    this.last = -Infinity
    this.latched = false
  }
  update(
    t: number,
    jaw: number | undefined,
    permitted: boolean,
    durationMs: number
  ): { fired: boolean; progress: number } {
    if (!Number.isFinite(t) || !Number.isFinite(jaw) || !permitted || t <= this.last) {
      this.reset()
      return { fired: false, progress: 0 }
    }
    if (t - this.last > 250) this.reset()
    this.last = t
    if (jaw! <= this.thresholds.close) {
      this.closed = true
      this.since = undefined
      this.latched = false
    } else if (jaw! >= this.thresholds.open && this.closed && !this.latched) {
      if (this.since === undefined || Math.abs(jaw! - this.reference) > 0.1) {
        this.since = t
        this.reference = jaw!
      }
      const progress = Math.min(1, (t - this.since) / durationMs)
      if (progress === 1) this.latched = true
      return { fired: progress === 1, progress }
    } else this.since = undefined
    return { fired: false, progress: 0 }
  }
}
