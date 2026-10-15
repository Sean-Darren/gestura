import { describe, expect, it } from 'vitest'
import { CalibrationWizard, TEST_TARGETS } from './calibration'
import type { CalibrationObservation } from './calibration'
import { scriptedWizard, completeBlinkPhase, completeTargets } from './calibration-fixture'

describe('calibration state machine', () => {
  it('retries insufficient ranges and does not mistake a wink for a deliberate blink', () => {
    const w = new CalibrationWizard(0, { width: 1280, height: 720, scaleFactor: 1 })
    const observe = (t: number): void =>
      w.observe({
        t,
        pose: { yaw: 0, pitch: 0 },
        centered: true,
        lightingGood: true,
        features: undefined,
        left: 0,
        right: 0
      })
    observe(0)
    w.next()
    for (let t = 50; t <= 8200; t += 50) observe(t)
    expect(w.stage).toBe('range')
    expect(w.index).toBe(0)
    expect(w.message).toContain('Not enough')
    const s = scriptedWizard()
    s.observe({ left: 0.9, right: 0 }, 12)
    s.observe()
    expect(s.wizard.index).toBe(0)
  })
  it('rejects an uninformative gaze session and offers the framing choice again', () => {
    const s = scriptedWizard(true)
    for (let dot = 0; dot < 9; dot++)
      while (s.wizard.stage === 'gaze' && s.wizard.index === dot)
        s.observe({ features: [0, 0, 0, 0, 0, 0] })
    expect(s.wizard.stage).toBe('framing')
    expect(s.wizard.mapping).toBeNull()
    expect(s.wizard.message).toContain('Gaze fit failed')
    s.wizard.setGaze(false)
    expect(s.wizard.gazeEnabled).toBe(false)
  })

  it('captures neutral/ranges, skips disabled gaze, learns blink thresholds and requires five dwell hits', () => {
    const s = scriptedWizard()
    expect(s.wizard.stage).toBe('deliberate-blinks')
    expect(s.wizard.neutral).toEqual({ yaw: 0, pitch: 0 })
    expect(s.wizard.range).toEqual({ left: 15, right: 20, up: 10, down: 12 })
    expect(() => s.wizard.profile(s.time())).toThrow()
    completeBlinkPhase(s)
    expect(s.wizard.stage).toBe('quick-test')
    completeTargets(s)
    expect(s.wizard.stage).toBe('review')
    const profile = s.wizard.profile(s.time())
    expect(profile.quickTestHits).toBe(5)
    expect(profile.gaze.mapping).toBeNull()
    expect(profile.blink.deliberateMs).toHaveLength(3)
    expect(profile.blink.minLongBlinkMs).toBeGreaterThan(profile.blink.naturalMaxMs)
    s.wizard.complete()
    expect(s.wizard.stage).toBe('complete')
  })
  it('captures nine 1.5-second gaze dots and fits the known iris mapping', () => {
    const s = scriptedWizard(true)
    expect(s.wizard.stage).toBe('gaze')
    for (let i = 0; i < 9; i++) {
      const target = s.wizard.target!
      while (s.wizard.stage === 'gaze' && s.wizard.index === i)
        s.observe({
          features: [target.x - 0.5, target.y - 0.5, target.x - 0.5, target.y - 0.5, 0, 0]
        })
    }
    expect(s.wizard.stage).toBe('deliberate-blinks')
    expect(s.wizard.mapping?.rmse).toBeLessThan(0.001)
  })
  it('freezes capture on pause, restarts interrupted neutral capture and counts elapsed wall duration', () => {
    const w = new CalibrationWizard(0, { width: 1280, height: 720, scaleFactor: 1 })
    const observation = (t: number): CalibrationObservation => ({
      t,
      pose: { yaw: 0, pitch: 0 },
      centered: true,
      lightingGood: true,
      features: undefined,
      left: 0,
      right: 0
    })
    w.observe(observation(0))
    w.next()
    w.observe(observation(50))
    w.observe(observation(150))
    const remaining = w.remainingMs
    w.setPaused(true, 150)
    w.observe(observation(200))
    w.tick(1150)
    expect(w.remainingMs).toBe(remaining)
    expect(w.elapsedMs).toBe(1150)
    w.setPaused(false, 1150)
    w.observe(observation(1200))
    expect(w.remainingMs).toBe(remaining)
    w.interrupt()
    expect(w.remainingMs).toBe(3000)
    expect(w.stage).toBe('neutral')
  })
  it('requires centered suitable lighting and rejects insufficient motion', () => {
    const w = new CalibrationWizard(0, { width: 1280, height: 720, scaleFactor: 1 })
    w.next()
    expect(w.stage).toBe('framing')
    w.observe({
      t: 50,
      pose: { yaw: 0, pitch: 0 },
      centered: false,
      lightingGood: false,
      features: undefined,
      left: 0,
      right: 0
    })
    w.next()
    expect(w.stage).toBe('framing')
    const s = scriptedWizard()
    s.wizard.retry()
    expect(s.wizard.stage).toBe('deliberate-blinks')
    s.wizard.cancel()
    expect(s.wizard.active).toBe(false)
  })
  it('does not select targets while paused or without fresh frames', () => {
    const s = scriptedWizard()
    completeBlinkPhase(s)
    s.wizard.setPaused(true, s.time())
    s.wizard.observePoint(TEST_TARGETS[0]!, s.time() + 2000)
    expect(s.wizard.index).toBe(0)
    s.wizard.setPaused(false, s.time() + 2000)
    s.wizard.observePoint(TEST_TARGETS[0]!, s.time() + 4000)
    expect(s.wizard.index).toBe(0)
  })
})

it('stores the median open-eye EAR baseline from neutral and remains compatible without one', () => {
  const s = scriptedWizard(false, { left: 0.31, right: 0.33, aspectRatio: 16 / 9 })
  completeBlinkPhase(s)
  completeTargets(s)
  expect(s.wizard.profile(s.time()).blink.ear).toEqual({
    left: 0.31,
    right: 0.33,
    aspectRatio: 16 / 9,
    closedRatio: 0.45,
    openRatio: 0.75
  })
  const legacy = scriptedWizard()
  completeBlinkPhase(legacy)
  completeTargets(legacy)
  expect(legacy.wizard.profile(legacy.time()).blink.ear).toBeUndefined()
})
