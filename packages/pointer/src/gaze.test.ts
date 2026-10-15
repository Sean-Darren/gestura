import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { GazeJump, estimateGaze } from './gaze'
import { PointerPipeline } from './index'
import { testFrame } from './test-frames'
const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  coordinateSpace: 'pixels' as const
}
const config = { ...DEFAULT_POINTER_CONFIG, gazeEnabled: true }
function eyes(x: number, y: number, time = 0): ReturnType<typeof testFrame> {
  const frame = testFrame(time)
  for (const [iris, a, b, top, bottom, start] of [
    [468, 33, 133, 159, 145, 0.2],
    [473, 362, 263, 386, 374, 0.6]
  ]) {
    for (const [index, px, py] of [
      [a!, start!, 0.4],
      [b!, start! + 0.1, 0.4],
      [top!, start! + 0.05, 0.38],
      [bottom!, start! + 0.05, 0.42],
      [iris!, start! + x * 0.1, 0.4 + (y - 0.5) * 0.04]
    ]) {
      frame.landmarks[index! * 3] = px!
      frame.landmarks[index! * 3 + 1] = py!
    }
  }
  return frame
}
describe('coarse gaze', () => {
  it('is disabled by default', () => {
    const jump = new GazeJump(DEFAULT_POINTER_CONFIG)
    expect(jump.update({ x: 1000, y: 0 }, { x: 0, y: 0 }, 0)).toBeUndefined()
    expect(jump.update({ x: 1000, y: 0 }, { x: 0, y: 0 }, 1000)).toBeUndefined()
  })
  it('projects both irises relative to corners and corrects for head pose', () => {
    const centered = estimateGaze(eyes(0.5, 0.5), { yaw: 0, pitch: 0 }, display, config)!
    expect(centered.x).toBeCloseTo(959.5, 2)
    expect(centered.y).toBeCloseTo(539.5, 2)
    const moved = estimateGaze(eyes(0.8, 0.8), { yaw: 10, pitch: 10 }, display, config)!
    expect(moved.x).toBeCloseTo(1919 * 0.75, 2)
    expect(moved.y).toBeCloseTo(1079 * 0.75, 2)
    expect(estimateGaze(testFrame(), { yaw: 0, pitch: 0 }, display, config)).toBeUndefined()
  })
  it('requires 300 ms of stability and strictly more than 300 px', () => {
    const jump = new GazeJump(config),
      cursor = { x: 0, y: 0 },
      gaze = { x: 301, y: 0 }
    expect(jump.update(gaze, cursor, 0)).toBeUndefined()
    expect(jump.update(gaze, cursor, 299)).toBeUndefined()
    expect(jump.update(gaze, cursor, 300)).toEqual(gaze)
    jump.reset()
    jump.update({ x: 300, y: 0 }, cursor, 0)
    expect(jump.update({ x: 300, y: 0 }, cursor, 300)).toBeUndefined()
  })
  it('restarts stability after drift or lost eyes', () => {
    const jump = new GazeJump(config),
      cursor = { x: 0, y: 0 }
    jump.update({ x: 500, y: 0 }, cursor, 0)
    expect(jump.update({ x: 550, y: 0 }, cursor, 250)).toBeUndefined()
    expect(jump.update({ x: 550, y: 0 }, cursor, 300)).toBeUndefined()
    jump.update(undefined, cursor, 400)
    expect(jump.update({ x: 550, y: 0 }, cursor, 500)).toBeUndefined()
  })
  it('re-anchors head fine control after a gaze jump instead of snapping back', () => {
    const pipeline = new PointerPipeline({ neutral: { yaw: 0, pitch: 0 } }, display, config)
    let last
    for (let time = 0; time <= 300; time += 100)
      last = pipeline.process(eyes(0.9, 0.5, time), time + 10)
    expect(last?.kind).toBe('gaze-jump')
    const next = pipeline.process(eyes(0.9, 0.5, 400), 410)
    expect(next?.x).toBeCloseTo(last!.x, 6)
    const tilted = eyes(0.9, 0.5, 500)
    tilted.matrix = testFrame(500, 5, 0).matrix
    expect(pipeline.process(tilted, 510)!.x).toBeGreaterThan(next!.x)
  })
})
