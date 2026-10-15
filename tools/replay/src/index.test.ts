import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameBus, FixturePlayer, ScriptedRecorder, parseFixture } from './index'
import type { FaceFrame } from '@gestura/core'
import { serializeFaceFrame } from '@gestura/core'
const frame = (t: number): FaceFrame => ({
  tCapture: t,
  tInferDone: t + 5,
  faceDetected: false,
  landmarks: new Float32Array(1434),
  blendshapes: {},
  matrix: new Float32Array(16)
})
afterEach(() => vi.useRealTimers())
describe('fixture recording and replay', () => {
  it('records derived JSONL and exact prompt intervals', () => {
    const recorder = new ScriptedRecorder(100, 1000, ['Look left', 'Blink'])
    recorder.append(frame(200))
    expect(recorder.tick(1100).prompt).toBe('Blink')
    recorder.append(frame(1200))
    const session = recorder.finish(2100)
    expect(parseFixture(session.jsonl)).toHaveLength(2)
    expect(session.labels.prompts).toEqual([
      { prompt: 'Look left', start: 100, end: 1100 },
      { prompt: 'Blink', start: 1100, end: 2100 }
    ])
    expect(session.jsonl).not.toMatch(/pixels|audio|image/)
  })
  it('freezes prompt progression and drops frames during pause', () => {
    const recorder = new ScriptedRecorder(100, 1000, ['A', 'B'])
    recorder.setPaused(true, 600)
    recorder.append(frame(700))
    expect(recorder.tick(5000).remainingMs).toBe(500)
    recorder.setPaused(false, 1600)
    expect(recorder.tick(2100).prompt).toBe('B')
    const session = recorder.finish(3100)
    expect(session.labels.prompts).toEqual([
      { prompt: 'A', start: 100, end: 2100 },
      { prompt: 'B', start: 2100, end: 3100 }
    ])
    expect(session.jsonl).toBe('')
  })
  it('preserves frame timing through pause/resume and unsubscribe', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const end = vi.fn()
    const player = new FixturePlayer(
      [frame(100), frame(150), frame(200)],
      {
        now: () => Date.now(),
        schedule: (cb, delay) => {
          const timer = setTimeout(cb, delay)
          return () => clearTimeout(timer)
        }
      },
      end
    )
    const received: number[] = []
    const unsubscribe = player.subscribe((f) => received.push(f.tCapture))
    player.start()
    vi.advanceTimersByTime(25)
    expect(received).toEqual([100])
    player.setPaused(true)
    vi.advanceTimersByTime(1000)
    expect(received).toEqual([100])
    player.setPaused(false)
    vi.advanceTimersByTime(25)
    expect(received).toEqual([100, 150])
    unsubscribe()
    vi.advanceTimersByTime(50)
    expect(end).toHaveBeenCalledOnce()
    expect(received).toEqual([100, 150])
  })
  it('rejects malformed, unordered, and pixel-bearing fixtures', () => {
    expect(() => parseFixture('{invalid}')).toThrow()
    expect(() =>
      parseFixture(JSON.stringify({ ...serializeFaceFrame(frame(1)), pixels: 'base64' }))
    ).toThrow()
    expect(() =>
      parseFixture(
        [frame(2), frame(1)].map((f) => JSON.stringify(serializeFaceFrame(f))).join('\n')
      )
    ).toThrow('ordered')
    expect(parseFixture('')).toEqual([])
  })
  it('uses the same subscription interface for live/replay and stops scheduled frames', () => {
    vi.useFakeTimers()
    const bus = new FrameBus(),
      listener = vi.fn()
    const unsub = bus.subscribe(listener)
    bus.emit(frame(0))
    unsub()
    bus.emit(frame(1))
    expect(listener).toHaveBeenCalledOnce()
    const player = new FixturePlayer([frame(0)], {
      now: () => 0,
      schedule: (cb, delay) => {
        const timer = setTimeout(cb, delay)
        return () => clearTimeout(timer)
      }
    })
    player.subscribe(listener)
    player.start()
    player.stop()
    vi.runAllTimers()
    expect(listener).toHaveBeenCalledOnce()
  })
})
