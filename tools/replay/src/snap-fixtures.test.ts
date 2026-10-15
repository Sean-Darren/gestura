import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { PointerPipeline, SnapSelector, snapKey } from '../../../packages/pointer/src/index'
import type { UiElement } from '@gestura/core'
import { parseFixture } from './index'
it('does not flicker between adjacent buttons on the stored landmark jitter replay', async () => {
  const frames = parseFixture(
    await readFile(
      new URL('../../../fixtures/landmarks/p2.2-hold-still.jsonl', import.meta.url),
      'utf8'
    )
  )
  const pipeline = new PointerPipeline(
    { neutral: { yaw: 0, pitch: 0 } },
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, coordinateSpace: 'pixels' }
  )
  const points = frames
    .flatMap((frame) => {
      const p = pipeline.process(frame, frame.tInferDone + 1)
      return p ? [p] : []
    })
    .slice(60)
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y = points.reduce((sum, p) => sum + p.y, 0) / points.length
  const target = (left: number): UiElement => ({
    bounds: { x: left, y: y - 12, width: 24, height: 24 },
    name: 'Scripted button',
    role: 'button',
    isEnabled: true,
    isOffscreen: false,
    isClickable: true
  })
  const targets = [target(x - 24), target(x)]
  const run = (): string[] => {
    const selector = new SnapSelector()
    return points.map((p) => snapKey(selector.update(p, undefined, targets, p.tCapture)!))
  }
  const keys = run()
  expect(keys.length).toBeGreaterThan(100)
  expect(new Set(keys).size).toBe(1)
  expect(run()).toEqual(keys)
  console.info(
    `Synthetic landmark jitter replay: ${keys.length} selections; 0 target switches; two adjacent 24 px buttons`
  )
})
