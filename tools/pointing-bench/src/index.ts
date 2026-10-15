import { BenchConfigSchema } from '@gestura/core'
import type { BenchConfig, BenchTarget, BenchTrial, BenchSession } from '@gestura/core'
export const packageName = '@gestura/pointing-bench'
export const TARGET_SIZES = [16, 24, 32, 48] as const
export function layout(config: BenchConfig): BenchTarget[] {
  if (config.mode === 'standard')
    return TARGET_SIZES.flatMap((size) =>
      Array.from({ length: 13 }, (_, i) => {
        const angle = (2 * Math.PI * ((i * 6) % 13)) / 13 - Math.PI / 2,
          radius = Math.min(config.width, config.height) / 2 - 40
        return {
          id: `${size}-${i}`,
          label: `Target ${i + 1}`,
          role: 'target' as const,
          x: config.width / 2 + radius * Math.cos(angle) - size / 2,
          y: config.height / 2 + radius * Math.sin(angle) - size / 2,
          width: size,
          height: size
        }
      })
    )
  const result: BenchTarget[] = []
  const add = (
    role: BenchTarget['role'],
    label: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void => {
    result.push({ id: `${role}-${result.length}`, role, label, x, y, width, height })
  }
  for (let i = 0; i < 6; i++)
    add('toolbar', ['New', 'Open', 'Save', 'Undo', 'Redo', 'Print'][i]!, 12 + i * 36, 12, 24, 24)
  for (let i = 0; i < 3; i++) add('menu', ['File', 'Edit', 'View'][i]!, 12 + i * 80, 52, 72, 24)
  for (let i = 0; i < 3; i++)
    add('tab', ['Sheet 1', 'Sheet 2', 'Summary'][i]!, 12 + i * 88, 92, 80, 24)
  add('link', 'Help', 12, 132, 60, 20)
  add('link', 'Documentation', 100, 132, 140, 20)
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      add(
        'cell',
        `${String.fromCharCode(65 + col)}${row + 1}`,
        12 + col * 68,
        180 + row * 20,
        68,
        20
      )
  return result
}
export function contains(target: BenchTarget, x: number, y: number): boolean {
  return (
    x >= target.x && x < target.x + target.width && y >= target.y && y < target.y + target.height
  )
}
export class BenchRun {
  readonly config: BenchConfig
  readonly targets: BenchTarget[]
  readonly trials: BenchTrial[] = []
  private start: number
  private pausedAt: number | undefined
  private pauseMs = 0
  private samples: number[] = []
  private dropped = 0
  constructor(
    config: BenchConfig,
    readonly startedAt: number
  ) {
    this.config = BenchConfigSchema.parse(config)
    this.targets = layout(this.config)
    this.start = startedAt
  }
  get target(): BenchTarget | undefined {
    return this.targets[this.trials.length]
  }
  get paused(): boolean {
    return this.pausedAt !== undefined
  }
  pause(value: boolean, t: number): void {
    if (value && this.pausedAt === undefined) this.pausedAt = t
    if (!value && this.pausedAt !== undefined) {
      this.pauseMs += Math.max(0, t - this.pausedAt)
      this.pausedAt = undefined
    }
  }
  latency(t: number, ms: number): void {
    if (!this.target || this.paused || t < this.start || !Number.isFinite(ms) || ms < 0) return
    if (this.samples.length < 20000) this.samples.push(ms)
    else this.dropped++
  }
  private end(t: number, outcome: BenchTrial['outcome'], click: BenchTrial['click']): void {
    if (!this.target || this.paused || t < this.start) return
    this.trials.push({
      index: this.trials.length,
      target: this.target,
      start: this.start,
      end: t,
      selectionMs: Math.max(0, t - this.start - this.pauseMs),
      outcome,
      click,
      latencyMs: this.samples,
      droppedLatency: this.dropped
    })
    this.start = t
    this.pauseMs = 0
    this.samples = []
    this.dropped = 0
  }
  tick(t: number): void {
    if (!this.paused && t - this.start - this.pauseMs >= this.config.timeoutMs)
      this.end(t, 'timeout', null)
  }
  click(x: number, y: number, button: number, t: number): void {
    if (!this.target || this.paused) return
    this.end(t, contains(this.target, x, y) ? 'hit' : 'miss', { x, y, button })
  }
  session(t: number, status: BenchSession['status']): BenchSession {
    return {
      version: 1,
      config: this.config,
      startedAt: this.startedAt,
      endedAt: t,
      trials: [...this.trials],
      status
    }
  }
}
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null
}
export function summarize(session: BenchSession): {
  mode: BenchConfig['mode']
  sizePx: number
  widthPx: number
  trials: number
  hits: number
  misses: number
  timeouts: number
  hitRate: number
  falseClickRate: number | null
  medianSelectionMs: number | null
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  latencySamples: number
  droppedLatency: number
}[] {
  return [...new Set(session.trials.map((t) => `${t.target.width}x${t.target.height}`))]
    .sort((a, b) => {
      const [aw, ah] = a.split('x').map(Number),
        [bw, bh] = b.split('x').map(Number)
      return ah! - bh! || aw! - bw!
    })
    .map((key) => {
      const [widthPx, sizePx] = key.split('x').map(Number) as [number, number]
      const trials = session.trials.filter(
          (t) => t.target.height === sizePx && t.target.width === widthPx
        ),
        hits = trials.filter((t) => t.outcome === 'hit'),
        misses = trials.filter((t) => t.outcome === 'miss').length,
        timeouts = trials.filter((t) => t.outcome === 'timeout').length,
        latency = trials.flatMap((t) => t.latencyMs)
      const times = hits.map((t) => t.selectionMs).sort((a, b) => a - b),
        mid = Math.floor(times.length / 2)
      return {
        mode: session.config.mode,
        sizePx,
        widthPx,
        trials: trials.length,
        hits: hits.length,
        misses,
        timeouts,
        hitRate: hits.length / trials.length,
        falseClickRate: hits.length + misses ? misses / (hits.length + misses) : null,
        medianSelectionMs: times.length
          ? times.length % 2
            ? times[mid]!
            : (times[mid - 1]! + times[mid]!) / 2
          : null,
        latencyP50Ms: percentile(latency, 0.5),
        latencyP95Ms: percentile(latency, 0.95),
        latencySamples: latency.length,
        droppedLatency: trials.reduce((n, t) => n + t.droppedLatency, 0)
      }
    })
}
export function markdown(session: BenchSession): string {
  const num = (n: number | null): string => (n === null ? 'N/A' : n.toFixed(2))
  return (
    `Mode: ${session.config.mode}; CSS px; device scale ${session.config.scaleFactor}; status ${session.status}.\nLatency: capture to move sent, before OS delivery. Hit rate = hits / trials; false-click rate = misses / clicks (timeouts excluded). Median selection time includes successful trials only.\n\n| Size px | Trials | Hit % | False-click % | Timeouts | Median ms | Latency p50 ms | Latency p95 ms | Samples |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n` +
    summarize(session)
      .map(
        (r) =>
          `| ${r.widthPx === r.sizePx ? r.sizePx : `${r.widthPx}×${r.sizePx}`} | ${r.trials} | ${num(r.hitRate * 100)} | ${num(r.falseClickRate === null ? null : r.falseClickRate * 100)} | ${r.timeouts} | ${num(r.medianSelectionMs)} | ${num(r.latencyP50Ms)} | ${num(r.latencyP95Ms)} | ${r.latencySamples} |`
      )
      .join('\n') +
    '\n'
  )
}
