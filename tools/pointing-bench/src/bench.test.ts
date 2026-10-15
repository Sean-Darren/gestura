import { describe, expect, it } from 'vitest'
import { BenchRun, layout, contains, markdown, summarize } from './index'
import { BenchConfigSchema, BenchSessionSchema } from '@gestura/core'
const config = BenchConfigSchema.parse({
  mode: 'standard',
  width: 800,
  height: 500,
  scaleFactor: 1
})
describe('pointing benchmark', () => {
  it('uses four exact sizes and 13 deterministic multidirectional positions each', () => {
    const targets = layout(config)
    expect(targets).toHaveLength(52)
    expect(layout(config)).toEqual(targets)
    for (const size of [16, 24, 32, 48])
      expect(targets.filter((t) => t.width === size)).toHaveLength(13)
    for (const t of targets) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeGreaterThanOrEqual(0)
      expect(t.x + t.width).toBeLessThanOrEqual(800)
      expect(t.y + t.height).toBeLessThanOrEqual(500)
    }
    expect(
      Math.hypot(targets[1]!.x - targets[0]!.x, targets[1]!.y - targets[0]!.y)
    ).toBeGreaterThan(350)
  })
  it('includes all realistic roles and exactly 20px spreadsheet cells without overlap', () => {
    const targets = layout({ ...config, mode: 'realistic' })
    expect(new Set(targets.map((t) => t.role))).toEqual(
      new Set(['toolbar', 'menu', 'tab', 'link', 'cell'])
    )
    expect(targets.filter((t) => t.role === 'cell').every((t) => t.height === 20)).toBe(true)
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i]!,
          b = targets[j]!
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y
        ).toBe(true)
      }
  })
  it('uses half-open bounds, records every miss and excludes paused time and latency', () => {
    const run = new BenchRun(config, 1000),
      a = run.target!
    expect(contains(a, a.x, a.y)).toBe(true)
    expect(contains(a, a.x + a.width, a.y)).toBe(false)
    run.latency(1100, 10)
    run.pause(true, 1200)
    run.latency(1300, 999)
    run.click(a.x, a.y, 0, 1400)
    expect(run.trials).toHaveLength(0)
    run.pause(false, 2200)
    run.latency(2250, 30)
    run.click(a.x, a.y, 0, 2300)
    expect(run.trials[0]).toMatchObject({ outcome: 'hit', selectionMs: 300, latencyMs: [10, 30] })
    run.click(-1, -1, 2, 2500)
    expect(run.trials[1]).toMatchObject({ outcome: 'miss', click: { x: -1, y: -1, button: 2 } })
  })
  it('reports exact denominators, hit-only median, real sample percentiles and timeout N/A', () => {
    const run = new BenchRun({ ...config, timeoutMs: 1000 }, 0)
    run.latency(10, 10)
    run.latency(20, 80)
    run.click(run.target!.x, run.target!.y, 0, 100)
    run.click(0, 0, 0, 300)
    run.tick(1300)
    const session = BenchSessionSchema.parse(run.session(1300, 'cancelled')),
      row = summarize(session)[0]!
    expect(row).toMatchObject({
      trials: 3,
      hits: 1,
      misses: 1,
      timeouts: 1,
      hitRate: 1 / 3,
      falseClickRate: 0.5,
      medianSelectionMs: 100,
      latencyP50Ms: 10,
      latencyP95Ms: 80
    })
    expect(markdown(session)).toContain(
      '| 16 | 3 | 33.33 | 50.00 | 1 | 100.00 | 10.00 | 80.00 | 2 |'
    )
    const empty = new BenchRun(config, 0)
    empty.tick(30000)
    expect(summarize(empty.session(30000, 'cancelled'))[0]).toMatchObject({
      falseClickRate: null,
      latencyP95Ms: null,
      medianSelectionMs: null
    })
  })
  it('caps samples and does not carry them into another target or collect while idle', () => {
    const run = new BenchRun(config, 0)
    for (let i = 0; i < 20001; i++) run.latency(1, 10)
    run.click(0, 0, 0, 20)
    expect(run.trials[0]?.latencyMs).toHaveLength(20000)
    expect(run.trials[0]?.droppedLatency).toBe(1)
    run.click(0, 0, 0, 30)
    expect(run.trials[1]?.latencyMs).toEqual([])
  })
})

it('finishes both modes deterministically and groups realistic controls by full dimensions', () => {
  for (const mode of ['standard', 'realistic'] as const) {
    const run = new BenchRun({ ...config, mode }, 0)
    let time = 0
    while (run.target) {
      time += 100
      run.click(run.target.x + 1, run.target.y + 1, 0, time)
    }
    const session = run.session(time, 'complete'),
      rows = summarize(session)
    expect(rows.every((r) => r.hitRate === 1)).toBe(true)
    expect(session.trials).toHaveLength(mode === 'standard' ? 52 : 30)
    if (mode === 'realistic') expect(rows.map((r) => `${r.widthPx}x${r.sizePx}`)).toContain('68x20')
  }
})

it('keeps an actual click arriving before the timeout callback rather than silently dropping it', () => {
  const run = new BenchRun(config, 0)
  run.click(-1, -1, 0, 30001)
  expect(run.trials[0]).toMatchObject({ outcome: 'miss', click: { x: -1, y: -1, button: 0 } })
})
