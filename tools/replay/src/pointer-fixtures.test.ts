import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { PointerPipeline } from '../../../packages/pointer/src/index'
import { parseFixture, SessionLabelsSchema } from './index'
import type { CursorCommand } from '@gestura/core'
const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  coordinateSpace: 'pixels' as const
}
async function fixture(name: string): Promise<ReturnType<typeof parseFixture>> {
  const root = new URL('../../../fixtures/landmarks/', import.meta.url)
  const frames = parseFixture(await readFile(new URL(`${name}.jsonl`, root), 'utf8'))
  const labels = SessionLabelsSchema.parse(
    JSON.parse(await readFile(new URL(`${name}.labels.json`, root), 'utf8'))
  )
  expect(labels.sessionStart).toBe(frames[0]!.tCapture)
  expect(labels.sessionEnd).toBeGreaterThanOrEqual(frames.at(-1)!.tInferDone)
  return frames
}
function run(frames: ReturnType<typeof parseFixture>): CursorCommand[] {
  const pipeline = new PointerPipeline({ neutral: { yaw: 0, pitch: 0 } }, display)
  return frames.flatMap((frame) => {
    const command = pipeline.process(frame, frame.tInferDone + 1)
    return command ? [command] : []
  })
}
describe('derived pointer replay fixtures', () => {
  it('reports hold-still RMS jitter below the tunable starting threshold', async () => {
    const commands = run(await fixture('p2.2-hold-still')).slice(60)
    const meanX = commands.reduce((sum, c) => sum + c.x, 0) / commands.length
    const meanY = commands.reduce((sum, c) => sum + c.y, 0) / commands.length
    const rms = Math.sqrt(
      commands.reduce((sum, c) => sum + (c.x - meanX) ** 2 + (c.y - meanY) ** 2, 0) /
        commands.length
    )
    console.info(
      `Synthetic hold-still RMS: ${rms.toFixed(4)} px; threshold ${DEFAULT_POINTER_CONFIG.jitterThresholdPx} px; 1920x1080`
    )
    expect(rms).toBeGreaterThan(0)
    expect(rms).toBeLessThanOrEqual(DEFAULT_POINTER_CONFIG.jitterThresholdPx)
  })
  it('reaches all four primary screen edges within one pixel after filtering', async () => {
    const commands = run(await fixture('p2.2-head-sweep'))
    const xs = commands.map((c) => c.x),
      ys = commands.map((c) => c.y)
    const coverage = {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys)
    }
    console.info('Synthetic head-sweep coverage:', coverage)
    expect(coverage.left).toBeLessThan(1)
    expect(coverage.right).toBeGreaterThan(1918)
    expect(coverage.top).toBeLessThan(1)
    expect(coverage.bottom).toBeGreaterThan(1078)
    expect(commands.every((c) => c.x >= 0 && c.x <= 1919 && c.y >= 0 && c.y <= 1079)).toBe(true)
  })
  it('produces identical commands and timestamps for identical fixtures', async () => {
    for (const name of ['p2.1-synthetic', 'p2.2-hold-still', 'p2.2-head-sweep']) {
      const frames = await fixture(name)
      expect(run(frames)).toEqual(run(frames))
    }
  })
})
