import { fitRidge } from '@gestura/pointer'
import { TEST_TARGETS, mapToScreen } from '@gestura/pointer'
import type { Pose } from '@gestura/core'
import { describe, expect, it, vi } from 'vitest'
import { CalibrationController } from './controller'
import { CalibrationStore } from './store'
import { PauseController } from '../pause'
import { affectsPointerCoordinates } from '../display-policy'
import { testFrame } from '../../../../../packages/pointer/src/test-frames'
import {
  scriptedWizard,
  completeBlinkPhase,
  completeTargets
} from '../../../../../packages/pointer/src/calibration-fixture'
import type { CalibrationProfile, CalibrationState } from '@gestura/core'
function setup(profile: CalibrationProfile | undefined = undefined): {
  controller: CalibrationController
  pause: PauseController
  camera: ReturnType<typeof vi.fn>
  setTime(t: number): void
  states: CalibrationState[]
  store: CalibrationStore
} {
  let time = 1000
  const pause = new PauseController(),
    camera = vi.fn(),
    states: CalibrationState[] = [],
    store = new CalibrationStore('/unused-fixture-path')
  store.save = vi.fn().mockResolvedValue(undefined)
  store.logDuration = vi.fn().mockResolvedValue(undefined)
  store.clearLog = vi.fn().mockResolvedValue(undefined)
  const controller = new CalibrationController({
    profile,
    store,
    pause,
    now: () => time,
    display: () => ({ width: 1280, height: 720, scaleFactor: 2 }),
    publish: (s) => states.push(s),
    camera,
    fullScreen: vi.fn(),
    apply: vi.fn(),
    logging: false
  })
  return {
    controller,
    pause,
    camera,
    states,
    store,
    setTime: (t) => {
      time = t
    }
  }
}
describe('calibration runtime safety', () => {
  it('surfaces a first-run camera startup exception', () => {
    const f = setup()
    f.camera.mockImplementation(() => {
      throw new Error('Camera process unavailable')
    })
    f.controller.firstRun()
    expect(f.controller.state.message).toBe('Camera process unavailable')
    f.controller.dispose()
  })
  it('keeps first-run calibration active across fullscreen work-area changes', () => {
    const f = setup()
    f.controller.firstRun()
    if (affectsPointerCoordinates(['workArea'])) {
      f.pause.toggle()
      f.controller.displayChanged()
    }
    expect(f.controller.state.active).toBe(true)
    expect(f.pause.paused).toBe(false)
    expect(f.camera).toHaveBeenLastCalledWith(true)
    f.controller.dispose()
  })
  it('explains a paused start instead of silently ignoring it', async () => {
    const f = setup()
    f.pause.toggle()
    await f.controller.control({ operation: 'start' })
    expect(f.controller.state.active).toBe(false)
    expect(f.controller.state.message).toContain('Resume input')
    expect(f.camera).not.toHaveBeenCalled()
    f.pause.toggle()
    await f.controller.control({ operation: 'start' })
    expect(f.controller.state.active).toBe(true)
    f.controller.dispose()
  })

  it('lets a saved calibrated gaze mapping be switched off and back on without rerunning setup', async () => {
    const s = scriptedWizard()
    completeBlinkPhase(s)
    completeTargets(s)
    const profile = s.wizard.profile(s.time())
    profile.gaze = {
      enabled: true,
      mapping: fitRidge(
        Array.from({ length: 9 }, (_, i) => {
          const x = (i % 3) / 2,
            y = Math.floor(i / 3) / 2
          return { features: [x, y, x, y, 0, 0], target: { x, y } }
        })
      )
    }
    profile.pointer.gazeEnabled = true
    const f = setup(profile)
    await f.controller.control({ operation: 'gaze', enabled: false })
    expect(f.controller.state.gazeEnabled).toBe(false)
    await f.controller.control({ operation: 'gaze', enabled: true })
    expect(f.controller.state.gazeEnabled).toBe(true)
    expect(f.store.save).toHaveBeenCalledTimes(2)
    const missing = setup(s.wizard.profile(s.time()))
    await missing.controller.control({ operation: 'gaze', enabled: true })
    expect(missing.store.save).not.toHaveBeenCalled()
    expect(missing.controller.state.message).toContain('mapping')
  })

  it('starts first run once, uses only a virtual pointer, and rejects stale/paused media', () => {
    const f = setup()
    f.controller.firstRun()
    f.controller.firstRun()
    expect(f.camera).toHaveBeenCalledOnce()
    f.controller.diagnostics({ tCapture: 990, luminance: 0.5 })
    f.controller.consume(testFrame(980))
    f.controller.tick()
    expect(f.controller.state.lighting).toBe('good')
    expect(f.controller.state.cursor).not.toBeNull()
    f.pause.toggle()
    f.controller.consume(testFrame(990))
    expect(f.controller.state.cursor).toBeNull()
    f.pause.toggle()
    f.controller.consume(testFrame(990))
    expect(f.controller.state.cursor).toBeNull()
    f.setTime(1400)
    f.controller.tick()
    expect(f.controller.state.faceDetected).toBe(false)
    f.controller.dispose()
  })
  it('does not auto-start with a valid saved profile and gates save until the review step', async () => {
    const s = scriptedWizard()
    completeBlinkPhase(s)
    completeTargets(s)
    const f = setup(s.wizard.profile(s.time()))
    f.controller.firstRun()
    expect(f.camera).not.toHaveBeenCalled()
    f.controller.start()
    await f.controller.control({ operation: 'save' })
    expect(f.store.save).not.toHaveBeenCalled()
    expect(f.controller.state.message).toContain('five targets')
    await f.controller.control({ operation: 'cancel' })
    expect(f.controller.state.active).toBe(false)
    expect(f.camera).toHaveBeenLastCalledWith(false)
  })
  it('requires explicit opt-in and makes duration logs clearable', async () => {
    const f = setup()
    expect(f.controller.state.loggingEnabled).toBe(false)
    await f.controller.control({ operation: 'logging', enabled: true })
    expect(f.controller.state.loggingEnabled).toBe(true)
    await f.controller.control({ operation: 'clear-log' })
    expect(f.store.clearLog).toHaveBeenCalledOnce()
    expect(f.store.logDuration).not.toHaveBeenCalled()
  })
  it('cancels on display changes and reports camera errors with a retry route', async () => {
    const f = setup()
    f.controller.start()
    f.controller.fail('Camera denied')
    expect(f.controller.state.message).toContain('Camera denied')
    await f.controller.control({ operation: 'retry' })
    expect(f.camera).toHaveBeenLastCalledWith(true)
    f.controller.displayChanged()
    expect(f.controller.state.active).toBe(false)
    expect(f.controller.state.message).toContain('Display configuration')
  })
})

async function finishRuntime(logging: boolean): Promise<ReturnType<typeof setup>> {
  const f = setup()
  f.controller.start()
  let time = 1000
  const feed = (pose: Pose = { yaw: 0, pitch: 0 }, closed = false): void => {
    time += 50
    f.setTime(time)
    const frame = testFrame(time - 10, pose.yaw, pose.pitch)
    for (let i = 0; i < 478; i++) {
      frame.landmarks[i * 3] = 0.5
      frame.landmarks[i * 3 + 1] = 0.5
    }
    frame.landmarks[234 * 3] = 0.3
    frame.landmarks[454 * 3] = 0.7
    frame.landmarks[10 * 3 + 1] = 0.2
    frame.landmarks[152 * 3 + 1] = 0.8
    frame.blendshapes = { eyeBlinkLeft: closed ? 0.9 : 0, eyeBlinkRight: closed ? 0.9 : 0 }
    f.controller.diagnostics({ tCapture: time - 10, luminance: 0.5 })
    f.controller.consume(frame)
  }
  feed()
  await f.controller.control({ operation: 'next' })
  for (let i = 0; i < 61; i++) feed()
  for (const pose of [
    { yaw: -15, pitch: 0 },
    { yaw: 20, pitch: 0 },
    { yaw: 0, pitch: -10 },
    { yaw: 0, pitch: 12 }
  ])
    for (let i = 0; i < 102; i++) feed(pose)
  for (let blink = 0; blink < 3; blink++) {
    for (let i = 0; i < 11; i++) feed(undefined, true)
    feed()
  }
  for (let i = 0; i < 202; i++) feed()
  expect(f.controller.state.stage).toBe('quick-test')
  const display = {
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    scaleFactor: 2,
    coordinateSpace: 'pixels' as const
  }
  const profile = {
    neutral: { yaw: 0, pitch: 0 },
    range: { left: 15, right: 20, up: 10, down: 12 }
  }
  for (const [index, target] of TEST_TARGETS.entries()) {
    const angle = (axis: 'x' | 'y', goal: number): number => {
      let low = -30,
        high = 30
      for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2
        const pose = axis === 'x' ? { yaw: mid, pitch: 0 } : { yaw: 0, pitch: mid }
        const p = mapToScreen(pose, profile, display)
        const n = p[axis] / (axis === 'x' ? 2559 : 1439)
        if (n < goal) low = mid
        else high = mid
      }
      return (low + high) / 2
    }
    const pose = { yaw: angle('x', target.x), pitch: angle('y', target.y) }
    let frames = 0
    while (
      f.controller.state.stage === 'quick-test' &&
      f.controller.state.index === index &&
      frames++ < 200
    )
      feed(pose)
    expect(frames).toBeLessThan(200)
  }
  expect(f.controller.state.stage).toBe('review')
  if (logging) await f.controller.control({ operation: 'logging', enabled: true })
  await f.controller.control({ operation: 'save' })
  expect(f.controller.state.stage).toBe('complete')
  return f
}
it('saves an entire scripted runtime session and logs duration only after explicit opt-in', async () => {
  const off = await finishRuntime(false)
  expect(off.store.save).toHaveBeenCalledOnce()
  expect(off.store.logDuration).not.toHaveBeenCalled()
  const on = await finishRuntime(true)
  expect(on.store.logDuration).toHaveBeenCalledOnce()
  const saved = vi.mocked(on.store.save).mock.calls[0]![0]
  expect(saved.durationMs).toBeLessThan(120000)
  console.info(
    `Synthetic head-only wizard duration: ${(saved.durationMs / 1000).toFixed(2)} s (scripted clock, not a human onboarding result)`
  )
})
