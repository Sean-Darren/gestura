import { describe, expect, it } from 'vitest'
import { OverlayController } from './overlay'
import { PauseController } from '../pause'
import { testFrame } from '../../../../../packages/pointer/src/test-frames'
function setup(): {
  pause: PauseController
  overlay: OverlayController
  tick(t: number, x: number, y: number): void
  time(t: number): void
} {
  const pause = new PauseController()
  let t = 1000,
    point = { x: 500, y: 300 }
  const overlay = new OverlayController({
    pause,
    now: () => t,
    display: () => ({ width: 1000, height: 700, scaleFactor: 2 }),
    systemPoint: () => point,
    publish: () => {},
    tracking: () => true
  })
  return {
    pause,
    overlay,
    tick(time: number, x: number, y: number) {
      t = time
      point = { x, y }
      overlay.tick()
    },
    time(value: number) {
      t = value
    }
  }
}
describe('pause overlay', () => {
  it('reserves the corner in physical coordinates and requires exit before each toggle', () => {
    const s = setup()
    expect(s.overlay.reservedPhysical({ x: 1900, y: 50 })).toBe(true)
    expect(s.overlay.reservedPhysical({ x: 1500, y: 50 })).toBe(false)
    s.tick(1000, 500, 300)
    for (let t = 1100; t <= 2300; t += 100) s.tick(t, 950, 30)
    expect(s.pause.paused).toBe(true)
    for (let t = 2400; t <= 4000; t += 100) s.tick(t, 950, 30)
    expect(s.pause.paused).toBe(true)
    s.tick(4100, 500, 300)
    for (let t = 4200; t <= 5400; t += 100) s.tick(t, 950, 30)
    expect(s.pause.paused).toBe(false)
    s.overlay.dispose()
  })
  it('accepts only fresh paused head frames and hides the virtual cursor on face loss', () => {
    const s = setup()
    s.pause.toggle()
    s.time(1200)
    s.overlay.pausedFrame(testFrame(900))
    expect(s.overlay.snapshot.cursor).toBeNull()
    s.overlay.pausedFrame(testFrame(1180))
    expect(s.overlay.snapshot.cursor?.x).toBeCloseTo(500)
    const lost = testFrame(1190)
    lost.faceDetected = false
    s.overlay.pausedFrame(lost)
    expect(s.overlay.snapshot.cursor).toBeNull()
    s.overlay.dispose()
  })
})

it('can reach the pause corner and resume using only fresh derived head frames', () => {
  const s = setup()
  s.pause.toggle()
  s.time(1210)
  s.overlay.pausedFrame(testFrame(1200))
  for (let t = 1400; t <= 5000 && s.pause.paused; t += 200) {
    s.time(t + 10)
    s.overlay.pausedFrame(testFrame(t, 30, -25))
  }
  expect(s.pause.paused).toBe(false)
  s.overlay.dispose()
})
