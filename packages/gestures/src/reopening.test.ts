import { describe, expect, it } from 'vitest'
import type { CalibrationProfile, FaceFrame } from '@gestura/core'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import { GestureEngine, eyeAspectRatios } from './index'

const point = { x: 800, y: 450 }
function frame(
  t: number,
  left: number,
  right: number,
  leftOpen = true,
  rightOpen = true
): FaceFrame {
  const landmarks = new Float32Array(478 * 3)
  for (const [indices, x, open] of [
    [[362, 263, 385, 387, 373, 380], 0.5, leftOpen],
    [[33, 133, 160, 158, 153, 144], 0.2, rightOpen]
  ] as const) {
    const coordinates = [
      [x, 0.5],
      [x + 0.1, 0.5],
      [x + 0.03, open ? 0.47 : 0.5],
      [x + 0.07, open ? 0.47 : 0.5],
      [x + 0.07, open ? 0.53 : 0.5],
      [x + 0.03, open ? 0.53 : 0.5]
    ]
    indices.forEach((index, i) => {
      landmarks[index * 3] = coordinates[i]![0]!
      landmarks[index * 3 + 1] = coordinates[i]![1]!
    })
  }
  return {
    tCapture: t,
    tInferDone: t + 1,
    faceDetected: true,
    landmarks,
    matrix: new Float32Array(16),
    blendshapes: { eyeBlinkLeft: left, eyeBlinkRight: right, jawOpen: 0 }
  }
}
const ear = eyeAspectRatios(frame(0, 0.1, 0.1), 16 / 9)!
const blink: CalibrationProfile['blink'] = {
  closedScore: 0.48,
  openScore: 0.23,
  minLongBlinkMs: 623,
  naturalMaxMs: 200,
  deliberateMs: [1000, 1000, 1000],
  naturalObservationMs: 10000,
  ear: { ...ear, aspectRatio: 16 / 9, closedRatio: 0.45, openRatio: 0.75 }
}
function engine(profile = blink): GestureEngine {
  return new GestureEngine(profile, { ...DEFAULT_GESTURE_CONFIG, mode: 'blink' })
}
function close(e: GestureEngine): void {
  e.update(frame(0, 0.1, 0.1), point, 0)
  for (let t = 50; t <= 850; t += 50) e.update(frame(t, 0.9, 0.9, false, false), point, 0)
}
describe('landmark-assisted eye reopening', () => {
  it('completes one left click when reopened scores remain above the old open threshold', () => {
    const e = engine()
    close(e)
    const result = e.update(frame(900, 0.28, 0.26), point, 0)
    expect(result.events).toMatchObject([{ kind: 'click', button: 'left', source: 'long-blink' }])
    expect(e.diagnostics).toMatchObject({
      left: 'open',
      right: 'open',
      reason: 'accepted',
      durationMs: 850
    })
    expect(e.update(frame(950, 0.28, 0.26), point, 0).events).toEqual([])
  })
  it('arms from open landmarks when initial blendshapes sit in the uncertainty band', () => {
    const e = engine()
    expect(e.update(frame(0, 0.28, 0.26), point, 0).eyesOpen).toBe(true)
    expect(e.diagnostics.phase).toBe('ready')
  })
  it('supports a right-eye wink while the other open eye has an ambiguous score', () => {
    const e = engine()
    e.update(frame(0, 0.28, 0.26), point, 0)
    for (let t = 50; t <= 350; t += 50) e.update(frame(t, 0.28, 0.9, true, false), point, 0)
    expect(e.update(frame(400, 0.28, 0.26), point, 0).events).toMatchObject([
      { kind: 'wink', eye: 'right' },
      { kind: 'click', button: 'right' }
    ])
  })
  it('never overrides a strong closed score even if landmarks appear open', () => {
    const e = engine()
    close(e)
    expect(e.update(frame(900, 0.7, 0.7), point, 0).events).toEqual([])
    expect(e.diagnostics).toMatchObject({ left: 'closed', right: 'closed' })
  })
  it('does not reopen ambiguous scores when the physical eye contours remain closed', () => {
    const e = engine()
    close(e)
    expect(e.update(frame(900, 0.28, 0.26, false, false), point, 0).events).toEqual([])
    expect(e.diagnostics.left).toBe('closed')
  })
  it.each(['missing-baseline', 'invalid-landmarks', 'wrong-aspect'] as const)(
    'fails closed with %s',
    (kind) => {
      const legacy = { ...blink }
      delete legacy.ear
      const e = engine(kind === 'missing-baseline' ? legacy : blink)
      close(e)
      const f = frame(900, 0.28, 0.26)
      if (kind === 'invalid-landmarks') f.landmarks.fill(0)
      expect(e.update(f, point, 0, kind === 'wrong-aspect' ? 1 : 16 / 9).events).toEqual([])
      expect(e.diagnostics.left).toBe('closed')
    }
  )
  it('still rejects natural blinks and overlong closures', () => {
    const e = engine()
    e.update(frame(0, 0.1, 0.1), point, 0)
    e.update(frame(50, 0.9, 0.9, false, false), point, 0)
    expect(e.update(frame(200, 0.28, 0.26), point, 0).events).toEqual([])
    for (let t = 250; t <= 1900; t += 50) e.update(frame(t, 0.9, 0.9, false, false), point, 0)
    expect(e.update(frame(1950, 0.28, 0.26), point, 0).events).toEqual([])
    expect(e.diagnostics.reason).toBe('too-long')
  })
  it.each(['moving', 'speech'] as const)(
    'does not bypass %s suppression when landmarks reopen the eyes',
    (reason) => {
      const e = engine()
      e.update(frame(0, 0.1, 0.1), point, 0)
      for (let t = 50; t <= 850; t += 50)
        e.update(
          frame(t, 0.9, 0.9, false, false),
          point,
          reason === 'moving' ? 1000 : 0,
          16 / 9,
          reason === 'speech' ? 'speaking' : 'silent'
        )
      expect(e.update(frame(900, 0.28, 0.26), point, 0).events).toEqual([])
      expect(e.diagnostics.reason).toBe(reason)
    }
  )
})
