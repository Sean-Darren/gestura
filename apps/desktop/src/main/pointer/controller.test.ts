import {
  scriptedWizard,
  completeBlinkPhase,
  completeTargets
} from '../../../../../packages/pointer/src/calibration-fixture'
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

describe('gesture native dispatch', () => {
  function calibrated(): ReturnType<typeof setup> & {
    sample(t: number, left?: number, right?: number, yaw?: number): void
  } {
    const s = setup(),
      session = scriptedWizard()
    completeBlinkPhase(session)
    completeTargets(session)
    s.controller.applyCalibration(session.wizard.profile(session.time()))
    s.controller.setGestureMode('blink')
    s.controller.setSource('running')
    s.controller.setEnabled(true)
    function sample(t: number, left = 0, right = left, yaw = 0): void {
      s.setTime(t + 10)
      const f = testFrame(t, yaw)
      f.blendshapes = { eyeBlinkLeft: left, eyeBlinkRight: right, jawOpen: 0 }
      s.controller.consume(f)
    }
    sample(1000)
    sample(1050)
    return { ...s, sample }
  }
  it('freezes all moves while closed and clicks the frozen position before resuming', () => {
    const s = calibrated(),
      frozen = { ...s.mock.cursor }
    const moves = s.mock.calls.filter((c) => c.method === 'moveTo').length
    for (let t = 1100; t <= 1700; t += 50) s.sample(t, 0.9, 0.9, 15)
    expect(s.mock.calls.filter((c) => c.method === 'moveTo')).toHaveLength(moves)
    s.sample(1750)
    const click = s.mock.calls.findIndex((c) => c.method === 'click')
    expect(click).toBeGreaterThan(0)
    expect(s.mock.calls[click - 1]).toEqual({ method: 'moveTo', args: [frozen.x, frozen.y] })
    expect(s.mock.calls[click]?.args).toEqual(['left'])
  })
  it('releases drag on pause and never dispatches a paused click or move', () => {
    const s = calibrated()
    s.controller.setDragging(true)
    expect(s.mock.calls.at(-1)?.method).toBe('mouseDown')
    s.pause.toggle()
    expect(s.mock.calls.at(-1)?.method).toBe('mouseUp')
    const count = s.mock.calls.length
    for (let t = 1100; t <= 1900; t += 50) s.sample(t, t < 1800 ? 0.9 : 0)
    expect(s.mock.calls).toHaveLength(count)
  })
  it('releases drag on face loss and disables gestures during replay', () => {
    const s = calibrated()
    s.controller.setDragging(true)
    s.setTime(1110)
    const lost = testFrame(1100)
    lost.faceDetected = false
    s.controller.consume(lost)
    expect(s.mock.calls.at(-1)?.method).toBe('mouseUp')
    s.controller.setSource('replaying')
    const count = s.mock.calls.length
    for (let t = 1200; t <= 2200; t += 50) s.sample(t, t < 2000 ? 0.9 : 0)
    expect(s.mock.calls).toHaveLength(count)
  })
})

it('exports individual live movement latencies and never replay or paused samples', () => {
  const mock = new MockNativeInput(),
    pause = new PauseController(),
    samples: { time: number; ms: number }[] = []
  let time = 1000
  const controller = new PointerController({
    bridge: createNativeInput(pause, () => mock),
    pause,
    now: () => time,
    publish: () => {},
    latencySample: (t, ms) => samples.push({ time: t, ms })
  })
  controller.setSource('running')
  controller.setEnabled(true)
  controller.consume(testFrame(980))
  time = 1020
  controller.consume(testFrame(1000))
  expect(samples).toEqual([
    { time: 1000, ms: 20 },
    { time: 1020, ms: 20 }
  ])
  pause.toggle()
  controller.consume(testFrame(1010))
  pause.toggle()
  controller.setSource('replaying')
  controller.consume(testFrame(100))
  expect(samples).toHaveLength(2)
  controller.dispose()
})

it('leaves continuous cursor movement free and changes only click destinations to a snap center', () => {
  const mock = new MockNativeInput(),
    pause = new PauseController()
  let time = 1000,
    updates = 0,
    resets = 0,
    clicks = 0
  const controller = new PointerController({
    bridge: createNativeInput(pause, () => mock),
    pause,
    now: () => time,
    publish: () => {},
    snapping: {
      update: () => {
        updates++
      },
      reset: () => {
        resets++
      },
      click: () => {
        clicks++
        return { x: 100, y: 120 }
      }
    }
  })
  const s = scriptedWizard()
  completeBlinkPhase(s)
  completeTargets(s)
  controller.applyCalibration(s.wizard.profile(s.time()))
  controller.setGestureMode('blink')
  controller.setSource('running')
  controller.setEnabled(true)
  const sample = (t: number, closed = 0): void => {
    time = t + 10
    const f = testFrame(t)
    f.blendshapes = { eyeBlinkLeft: closed, eyeBlinkRight: closed, jawOpen: 0 }
    controller.consume(f)
  }
  sample(1000)
  sample(1050)
  expect(mock.cursor).toEqual({ x: 959.5, y: 539.5 })
  expect(updates).toBeGreaterThan(0)
  for (let t = 1100; t <= 1700; t += 50) sample(t, 0.9)
  sample(1750)
  const i = mock.calls.findIndex((c) => c.method === 'click')
  expect(mock.calls[i - 1]).toEqual({ method: 'moveTo', args: [100, 120] })
  expect(clicks).toBe(1)
  sample(1800)
  expect(mock.cursor).toEqual({ x: 959.5, y: 539.5 })
  controller.setDragging(true)
  expect(mock.calls.at(-2)).toEqual({ method: 'moveTo', args: [959.5, 539.5] })
  expect(clicks).toBe(1)
  pause.toggle()
  expect(resets).toBeGreaterThan(0)
  controller.dispose()
})
