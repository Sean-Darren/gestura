import { describe, expect, it } from 'vitest'
import { PointerPipeline } from './index'
import { testFrame } from './test-frames'
const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  coordinateSpace: 'pixels' as const
}
const profile = { neutral: { yaw: 0, pitch: 0 } }
describe('pointer stream state', () => {
  it('preserves stage stamps and rejects duplicate or out-of-order captures', () => {
    const p = new PointerPipeline(profile, display)
    const command = p.process(testFrame(100), 111)!
    expect(command.tCapture).toBe(100)
    expect(command.tInferDone).toBe(110)
    expect(command.tPointerDone).toBe(111)
    expect(p.process(testFrame(100, 10), 112)).toBeUndefined()
    expect(p.process(testFrame(99, 10), 112)).toBeUndefined()
  })
  it('resets filters after face loss, pause reset and large frame gaps', () => {
    const p = new PointerPipeline(profile, display)
    p.process(testFrame(0, 20), 10)
    const lost = testFrame(16)
    lost.faceDetected = false
    expect(p.process(lost, 26)).toBeUndefined()
    expect(p.process(testFrame(15, 20), 27)).toBeUndefined()
    expect(p.process(testFrame(32), 42)!.x).toBe(959.5)
    p.process(testFrame(48, 20), 58)
    p.reset()
    expect(p.process(testFrame(64), 74)!.x).toBe(959.5)
    p.process(testFrame(80, 20), 90)
    expect(p.process(testFrame(1000), 1010)!.x).toBe(959.5)
  })
  it('suppresses invalid face matrices without leaking NaN commands', () => {
    const p = new PointerPipeline(profile, display),
      frame = testFrame()
    frame.matrix = new Float32Array(16)
    expect(p.process(frame, 10)).toBeUndefined()
  })
})
