import { describe, expect, it } from 'vitest'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import type { CalibrationProfile, FaceFrame, GestureEvent } from '@gestura/core'
import { GestureEngine, CornerDwell, EyeHysteresis, eyeAspectRatios } from './index'
import { GestureDetectionSchema } from '@gestura/core'
const blink: CalibrationProfile['blink'] = {
  closedScore: 0.6,
  openScore: 0.3,
  minLongBlinkMs: 400,
  naturalMaxMs: 150,
  deliberateMs: [600, 600, 600],
  naturalObservationMs: 10000
}
const point = { x: 800, y: 450 }
function frame(t: number, left = 0, right = 0, jaw = 0): FaceFrame {
  return {
    tCapture: t,
    tInferDone: t + 1,
    faceDetected: true,
    landmarks: new Float32Array(1434),
    matrix: new Float32Array(16),
    blendshapes: { eyeBlinkLeft: left, eyeBlinkRight: right, jawOpen: jaw }
  }
}
function engine(mode: 'blink' | 'dwell' = 'blink'): GestureEngine {
  return new GestureEngine(blink, { ...DEFAULT_GESTURE_CONFIG, mode })
}
function closure(duration: number, left = true, right = true, speed = 0): GestureEvent[] {
  const e = engine()
  e.update(frame(0), point, 0)
  const events: GestureEvent[] = []
  for (let t = 50; t < 50 + duration; t += 50)
    events.push(...e.update(frame(t, left ? 0.9 : 0, right ? 0.9 : 0), point, speed).events)
  events.push(...e.update(frame(50 + duration), point, 0).events)
  return events
}
describe('click gesture timing and state', () => {
  it.each([
    [150, true, true, 0, 0, 'too-short'],
    [1800, true, true, 0, 0, 'too-long'],
    [600, true, true, 1000, 0, 'moving'],
    [600, true, true, 0, 0.5, 'speech'],
    [300, true, false, 0, 0, 'left-wink-unmapped'],
    [600, true, true, 0, 0, 'accepted'],
    [300, false, true, 0, 0, 'accepted']
  ] as const)('reports a %s ms closure as %s', (duration, left, right, speed, jaw, reason) => {
    const e = engine()
    e.update(frame(0), point, 0)
    for (let t = 50; t < 50 + duration; t += 50)
      e.update(frame(t, left ? 0.9 : 0, right ? 0.9 : 0, jaw), point, speed)
    e.update(frame(50 + duration), point, 0)
    expect(GestureDetectionSchema.parse(e.diagnostics).reason).toBe(reason)
    expect(e.diagnostics.phase).toBe(reason === 'accepted' ? 'accepted' : 'rejected')
    expect(e.diagnostics.durationMs).toBe(duration)
    e.update(frame(100 + duration), point, 0)
    expect(e.diagnostics.reason).toBe(reason)
  })
  it('shows eye states and the actual calibrated limits without changing hysteresis', () => {
    const e = new GestureEngine(
      { ...blink, minLongBlinkMs: 650 },
      { ...DEFAULT_GESTURE_CONFIG, mode: 'blink' }
    )
    e.update(frame(0, 0.45, 0), point, 0)
    expect(e.diagnostics).toMatchObject({
      left: 'unknown',
      right: 'open',
      reason: 'invalid-eye-signal',
      minLongBlinkMs: 650
    })
    e.update(frame(50), point, 0)
    expect(e.diagnostics).toMatchObject({ left: 'open', right: 'open', phase: 'ready' })
    e.update(frame(100, 0.9, 0.9), point, 0)
    e.update(frame(150, 0.9, 0.9), point, 0)
    expect(e.diagnostics).toMatchObject({
      left: 'closed',
      right: 'closed',
      phase: 'tracking',
      durationMs: 50
    })
  })
  it('explains starting with closed eyes, missing faces and disabled mode', () => {
    const e = engine()
    e.update(frame(0, 0.9, 0.9), point, 0)
    expect(e.diagnostics.reason).toBe('eyes-not-open')
    e.update({ ...frame(50), faceDetected: false }, point, 0)
    expect(e.diagnostics.reason).toBe('face-lost')
    const off = new GestureEngine(blink)
    off.update(frame(0), point, 0)
    expect(off.diagnostics.reason).toBe('mode-off')
  })
  it('explains unsynchronised eyes and keeps non-overlapping durations valid', () => {
    const e = engine()
    e.update(frame(0), point, 0)
    for (let t = 50; t <= 650; t += 50)
      e.update(frame(t, t < 150 ? 0.9 : 0, t >= 150 && t < 650 ? 0.9 : 0), point, 0)
    expect(GestureDetectionSchema.parse(e.diagnostics)).toMatchObject({
      reason: 'unsynchronised',
      durationMs: 0
    })
  })
  it('reports eyes reclosing during a gesture', () => {
    const e = engine()
    e.update(frame(0), point, 0)
    for (let t = 50; t <= 600; t += 50)
      e.update(frame(t, t === 400 || t === 600 ? 0 : 0.9, t === 600 ? 0 : 0.9), point, 0)
    expect(e.diagnostics.reason).toBe('reclosed')
  })
  it('reports cooldown and dragging without emitting another click', () => {
    const e = engine()
    e.update(frame(0), point, 0)
    for (let t = 50; t < 450; t += 50) e.update(frame(t, 0.9, 0.9), point, 0)
    e.update(frame(450), point, 0)
    for (let t = 500; t < 800; t += 50) e.update(frame(t, 0, 0.9), point, 0)
    expect(e.update(frame(800), point, 0).events).toEqual([])
    expect(e.diagnostics.reason).toBe('cooldown')
    e.setDragging(true, point, 850)
    for (let t = 850; t < 1500; t += 50) e.update(frame(t, 0.9, 0.9), point, 0)
    expect(e.update(frame(1500), point, 0).events).toEqual([])
    expect(e.diagnostics.reason).toBe('dragging')
  })
  it('uses hysteresis without toggling in the uncertainty band', () => {
    const eye = new EyeHysteresis()
    expect(eye.update(0.5, 0.6, 0.3)).toBe('unknown')
    expect(eye.update(0, 0.6, 0.3)).toBe('open')
    expect(eye.update(0.5, 0.6, 0.3)).toBe('open')
    expect(eye.update(0.9, 0.6, 0.3)).toBe('closed')
    expect(eye.update(0.4, 0.6, 0.3)).toBe('closed')
    expect(eye.update(undefined, 0.6, 0.3)).toBe('unknown')
  })
  it('accepts bilateral blinks at 400 and 1500 ms and rejects natural/overlong blinks', () => {
    for (const duration of [400, 1500])
      expect(closure(duration).filter((e) => e.kind === 'click')).toMatchObject([
        { source: 'long-blink', button: 'left' }
      ])
    for (const duration of [50, 150, 200, 250, 350, 1550, 2000])
      expect(closure(duration).filter((e) => e.kind === 'click')).toEqual([])
  })
  it('requires right wink >=250 ms, distinguishes left winks, and supports longer unilateral holds', () => {
    expect(closure(250, false, true).filter((e) => e.kind === 'click')).toMatchObject([
      { button: 'right', source: 'right-wink' }
    ])
    expect(closure(200, false, true).filter((e) => e.kind === 'click')).toEqual([])
    expect(closure(2000, false, true).filter((e) => e.kind === 'click')).toHaveLength(1)
    expect(closure(400, true, false)).toMatchObject([{ kind: 'wink', eye: 'left' }])
  })
  it('freezes on onset, emits only after reopening and clicks at the immutable captured position', () => {
    const e = engine()
    e.update(frame(0), point, 0)
    expect(e.update(frame(50, 0.9, 0.9), point, 0).frozen).toBe(true)
    for (let t = 100; t <= 400; t += 50) {
      const r = e.update(frame(t, 0.9, 0.9), { x: 2, y: 3 }, 0)
      expect(r.point).toEqual(point)
      expect(r.events).toEqual([])
    }
    const r = e.update(frame(450), { x: 4, y: 5 }, 0)
    expect(r.frozen).toBe(true)
    expect(r.events).toMatchObject([{ kind: 'click', ...point }])
    expect(e.update(frame(500), point, 0).frozen).toBe(false)
  })
  it('rejects asynchronous bilateral closures and high-speed episodes', () => {
    const e = engine()
    e.update(frame(0), point, 0)
    e.update(frame(50, 0.9, 0), point, 0)
    for (let t = 100; t <= 500; t += 50) e.update(frame(t, 0.9, t >= 200 ? 0.9 : 0), point, 0)
    expect(e.update(frame(550), point, 0).events).toEqual([])
    expect(closure(600, true, true, 1000)).toEqual([])
  })
  it('drops lost, stale and backwards sequences and requires open eyes before arming', () => {
    const e = engine()
    expect(e.update(frame(0, 0.9, 0.9), point, 0).frozen).toBe(true)
    expect(e.update(frame(50), point, 0).events).toEqual([])
    e.update(frame(100, 0.9, 0.9), point, 0)
    expect(e.update(frame(1000), point, 0).events).toEqual([])
    expect(e.update(frame(999, 0.9, 0.9), point, 0).events).toEqual([])
    e.update(frame(1050, 0.9, 0.9), point, 0)
    const lost = frame(1100)
    lost.faceDetected = false
    e.update(lost, point, 0)
    expect(e.update(frame(1150), point, 0).events).toEqual([])
  })
  it('uses a one-shot dwell anchor, suppresses fast/talking dwell and requires leaving to repeat', () => {
    const e = engine('dwell')
    let clicks = 0
    for (let t = 0; t <= 2500; t += 50)
      clicks += e.update(frame(t), point, 0).events.filter((e) => e.kind === 'click').length
    expect(clicks).toBe(1)
    e.update(frame(2550), { x: 900, y: 450 }, 0)
    for (let t = 2600; t <= 3600; t += 50)
      clicks += e.update(frame(t), point, 0).events.filter((e) => e.kind === 'click').length
    expect(clicks).toBe(2)
    const speaking = engine('dwell')
    for (let t = 0; t <= 2000; t += 50)
      expect(speaking.update(frame(t, 0, 0, 0.6), point, 0).events).toEqual([])
    const fast = engine('dwell')
    for (let t = 0; t <= 2000; t += 50)
      expect(fast.update(frame(t), point, 1000).events).toEqual([])
  })
  it('gates jaw hold on explicit silence, rejects varying speech and rearms after mouth closure', () => {
    for (const speech of ['unknown', 'speaking'] as const) {
      const e = engine()
      for (let t = 0; t <= 1600; t += 50)
        expect(e.update(frame(t, 0, 0, 0.8), point, 0, 16 / 9, speech).events).toEqual([])
    }
    const e = engine()
    const events: GestureEvent[] = []
    for (let t = 0; t <= 1600; t += 50)
      events.push(...e.update(frame(t, 0, 0, 0.8), point, 0, 16 / 9, 'silent').events)
    expect(events.filter((e) => e.kind === 'toggleListening')).toHaveLength(1)
    e.update(frame(1650), point, 0, 16 / 9, 'silent')
    for (let t = 1700; t <= 2600; t += 50)
      events.push(...e.update(frame(t, 0, 0, 0.8), point, 0, 16 / 9, 'silent').events)
    expect(events.filter((e) => e.kind === 'toggleListening')).toHaveLength(2)
    const talking = engine()
    for (let t = 0; t <= 2000; t += 50)
      expect(
        talking.update(frame(t, 0, 0, t % 200 < 100 ? 0.65 : 0.9), point, 0, 16 / 9, 'silent')
          .events
      ).toEqual([])
  })
  it('exposes balanced drag down/up events and releases drag on reset', () => {
    const e = engine()
    expect(e.setDragging(true, point, 0)).toMatchObject([{ kind: 'mouseDown' }])
    expect(e.setDragging(true, point, 1)).toEqual([])
    expect(e.reset(point, 2)).toMatchObject([{ kind: 'mouseUp' }])
    expect(e.reset(point, 3)).toEqual([])
  })
  it('latches corner dwell across pause until the target is exited', () => {
    const d = new CornerDwell()
    d.update(true, 0, 1200)
    d.update(true, 600, 1200)
    expect(d.update(true, 1200, 1200).toggle).toBe(true)
    d.latch()
    expect(d.update(true, 2500, 1200).toggle).toBe(false)
    d.update(false, 2600, 1200)
    d.update(true, 2700, 1200)
    d.update(true, 3300, 1200)
    expect(d.update(true, 3900, 1200).toggle).toBe(true)
  })
})
describe('relative EAR fallback', () => {
  it('uses MediaPipe eye contours and calibrated aspect-correct baselines when scores are absent', () => {
    const f = frame(0)
    f.blendshapes = {}
    for (const [a, b, p1, p2, p4, p5, start] of [
      [362, 263, 385, 387, 373, 380, 0.5],
      [33, 133, 160, 158, 153, 144, 0.2]
    ]) {
      for (const [i, x, y] of [
        [a!, start!, 0.5],
        [b!, start! + 0.1, 0.5],
        [p1!, start! + 0.03, 0.47],
        [p2!, start! + 0.07, 0.47],
        [p4!, start! + 0.07, 0.53],
        [p5!, start! + 0.03, 0.53]
      ]) {
        f.landmarks[i! * 3] = x!
        f.landmarks[i! * 3 + 1] = y!
      }
    }
    const baseline = eyeAspectRatios(f, 16 / 9)!
    expect(baseline.left).toBeCloseTo(0.3375, 4)
    const e = new GestureEngine(
      { ...blink, ear: { ...baseline, aspectRatio: 16 / 9, closedRatio: 0.45, openRatio: 0.75 } },
      { ...DEFAULT_GESTURE_CONFIG, mode: 'blink' }
    )
    expect(e.update(f, point, 0).eyesOpen).toBe(true)
    const events: GestureEvent[] = []
    for (let t = 50; t <= 450; t += 50) {
      const closed = { ...f, tCapture: t }
      for (const i of [385, 387, 373, 380, 160, 158, 153, 144]) closed.landmarks[i * 3 + 1] = 0.5
      events.push(...e.update(closed, point, 0).events)
    }
    for (const i of [385, 387, 160, 158]) f.landmarks[i * 3 + 1] = 0.47
    for (const i of [373, 380, 153, 144]) f.landmarks[i * 3 + 1] = 0.53
    events.push(...e.update({ ...f, tCapture: 500 }, point, 0).events)
    expect(events.filter((e) => e.kind === 'click')).toHaveLength(1)
    expect(eyeAspectRatios(frame(0), 16 / 9)).toBeUndefined()
  })
})

it('rejects flutter that re-closes an eye during a bilateral closure', () => {
  const e = engine()
  e.update(frame(0), point, 0)
  for (let t = 50; t <= 550; t += 50) e.update(frame(t, 0.9, 0.9), point, 0)
  e.update(frame(600, 0, 0.9), point, 0)
  e.update(frame(650, 0.9, 0.9), point, 0)
  expect(e.update(frame(700), point, 0).events).toEqual([])
})
