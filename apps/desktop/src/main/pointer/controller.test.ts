import { describe, expect, it } from 'vitest'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { PointerController, toNativePoint } from './controller'
import { PauseController } from '../pause'
import { createNativeInput } from '../native'
import { MockNativeInput } from '../../../../../native/gestura-native/mock'
import { testFrame } from '../../../../../packages/pointer/src/test-frames'
import type { PointerMetrics } from '@gestura/core'
function setup(): {
  controller: PointerController
  mock: MockNativeInput
  pause: PauseController
  reports: PointerMetrics[]
  setTime(time: number): void
} {
  const mock = new MockNativeInput(),
    pause = new PauseController(),
    reports: PointerMetrics[] = []
  let time = 1000
  const controller = new PointerController({
    bridge: createNativeInput(pause, () => mock),
    pause,
    now: () => time,
    publish: (metrics) => reports.push(metrics)
  })
  return {
    controller,
    mock,
    pause,
    reports,
    setTime: (value) => {
      time = value
    }
  }
}
describe('pointer dispatch', () => {
  it('keeps live gaze disabled until calibration exists', () => {
    const mock = new MockNativeInput(),
      pause = new PauseController()
    let now = 1000
    const controller = new PointerController({
      bridge: createNativeInput(pause, () => mock),
      pause,
      now: () => now,
      publish: () => {},
      config: { ...DEFAULT_POINTER_CONFIG, gazeEnabled: true }
    })
    controller.setSource('running')
    controller.setEnabled(true)
    for (let i = 0; i <= 4; i++) {
      now = 1000 + i * 100
      const frame = testFrame(now - 10)
      for (const [iris, a, b, top, bottom, start] of [
        [468, 33, 133, 159, 145, 0.2],
        [473, 362, 263, 386, 374, 0.6]
      ]) {
        for (const [index, x, y] of [
          [a!, start!, 0.4],
          [b!, start! + 0.1, 0.4],
          [top!, start! + 0.05, 0.38],
          [bottom!, start! + 0.05, 0.42],
          [iris!, start! + 0.09, 0.4]
        ]) {
          frame.landmarks[index! * 3] = x!
          frame.landmarks[index! * 3 + 1] = y!
        }
      }
      controller.consume(frame)
    }
    expect(mock.cursor.x).toBe(959.5)
  })
  it('reports nearest-rank p50/p95 for the rolling live latency window', () => {
    const { controller, setTime } = setup()
    controller.setSource('running')
    controller.setEnabled(true)
    for (const [i, latency] of [10, 20, 50, 80].entries()) {
      const now = 1000 + i * 100
      setTime(now)
      controller.consume(testFrame(now - latency))
    }
    expect(controller.metrics.samples).toBe(4)
    expect(controller.metrics.latencyP50Ms).toBe(20)
    expect(controller.metrics.latencyP95Ms).toBe(80)
  })

  it('clears metrics and filter state when fresh frames stop arriving', () => {
    const { controller, mock, setTime } = setup()
    controller.setSource('running')
    controller.setEnabled(true)
    controller.consume(testFrame(980, 20))
    setTime(1300)
    controller.tick()
    expect(controller.metrics.samples).toBe(0)
    expect(controller.metrics.message).toContain('No fresh')
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(1)
    setTime(1320)
    controller.consume(testFrame(1300))
    expect(mock.cursor.x).toBe(959.5)
  })

  it('starts disabled and only moves through the native bridge when enabled and tracking', () => {
    const { controller, mock } = setup()
    controller.setSource('running')
    controller.consume(testFrame(980))
    expect(mock.calls).toEqual([])
    controller.setEnabled(true)
    controller.consume(testFrame(980))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toEqual([
      { method: 'moveTo', args: [959.5, 539.5] }
    ])
    expect(controller.metrics.latencyP50Ms).toBe(20)
    expect(controller.metrics.latencyP95Ms).toBe(20)
    expect(controller.metrics.tMoveSent).toBe(1000)
  })
  it('drops all moves during pause and resets on resume', () => {
    const { controller, mock, pause, setTime } = setup()
    controller.setSource('running')
    controller.setEnabled(true)
    pause.toggle()
    controller.consume(testFrame(980))
    expect(mock.calls.some((c) => c.method === 'moveTo')).toBe(false)
    pause.toggle()
    controller.consume(testFrame(990))
    expect(mock.calls.some((c) => c.method === 'moveTo')).toBe(false)
    setTime(1050)
    controller.consume(testFrame(1030))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(1)
  })
  it('rejects stale, future, duplicate frames and face loss', () => {
    const { controller, mock } = setup()
    controller.setSource('running')
    controller.setEnabled(true)
    controller.consume(testFrame(0))
    controller.consume(testFrame(1001))
    const lost = testFrame(980)
    lost.faceDetected = false
    controller.consume(lost)
    controller.consume(testFrame(979))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(0)
    controller.consume(testFrame(981))
    controller.consume(testFrame(981))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(1)
  })
  it('previews replay with its original timestamps without native moves or bogus latency', () => {
    const { controller, mock } = setup()
    controller.setEnabled(true)
    controller.setSource('replaying')
    controller.consume(testFrame(0))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(0)
    expect(controller.metrics.replay).toBe(true)
    expect(controller.metrics.samples).toBe(0)
    expect(controller.metrics.message).toContain('Replay preview')
  })
  it('stops on missing permission, missing primary display, changed displays and native failure', () => {
    const { controller, mock } = setup()
    mock.permission = false
    controller.setEnabled(true)
    expect(controller.metrics.enabled).toBe(false)
    expect(controller.metrics.message).toContain('permission')
    mock.permission = true
    mock.displays = []
    controller.setEnabled(true)
    expect(controller.metrics.message).toContain('Primary display')
    const good = setup()
    good.controller.setEnabled(true)
    good.controller.invalidateDisplay()
    expect(good.controller.metrics.enabled).toBe(false)
    const broken = setup()
    broken.controller.setSource('running')
    broken.controller.setEnabled(true)
    broken.mock.moveTo = (): void => {
      throw new Error('Input failure')
    }
    broken.controller.consume(testFrame(980))
    expect(broken.controller.metrics.enabled).toBe(false)
    expect(broken.controller.metrics.message).toBe('Input failure')
  })
  it('converts physical pixels back to Quartz points and preserves Windows DPI-aware pixels', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      scaleFactor: 2,
      coordinateSpace: 'points' as const
    }
    expect(toNativePoint(1000, 700, display)).toEqual({ x: 500, y: 350 })
    expect(toNativePoint(1000, 700, { ...display, coordinateSpace: 'pixels' })).toEqual({
      x: 1000,
      y: 700
    })
  })
  it('does not move after stop, disable or dispose', () => {
    const { controller, mock } = setup()
    controller.setEnabled(true)
    controller.setSource('stopped')
    controller.consume(testFrame(980))
    controller.setSource('running')
    controller.setEnabled(false)
    controller.consume(testFrame(980))
    controller.dispose()
    controller.setEnabled(true)
    controller.consume(testFrame(980))
    expect(mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(0)
  })
})
