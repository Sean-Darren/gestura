import { describe, expect, it, vi } from 'vitest'
import { PauseController } from '../pause'
import { SpeechController } from './controller'
function setup(): {
  controller: SpeechController
  pause: PauseController
  options: {
    pause: PauseController
    start: ReturnType<typeof vi.fn<(generation: number, cb: (value: unknown) => void) => number>>
    connect: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    publish: ReturnType<typeof vi.fn>
    transcript: ReturnType<typeof vi.fn>
    activity: ReturnType<typeof vi.fn>
  }
  receives: ((value: unknown) => void)[]
} {
  const pause = new PauseController()
  const receives: ((value: unknown) => void)[] = []
  const options = {
    pause,
    start: vi.fn((_generation: number, cb: (value: unknown) => void) => receives.push(cb)),
    connect: vi.fn(),
    stop: vi.fn(),
    publish: vi.fn(),
    transcript: vi.fn(),
    activity: vi.fn()
  }
  const controller = new SpeechController(options)
  return { controller, pause, options, receives }
}
describe('local speech lifecycle', () => {
  it('gaze-only kills pending capture, ignores late permission/worker results, and blocks every restart', () => {
    const { controller, options, receives } = setup()
    controller.setEnabled(true)
    controller.setGazeOnly(true)
    receives[0]!({ kind: 'ready' })
    controller.capture({ generation: 1, live: true, error: false })
    controller.setEnabled(true)
    expect(options.start).toHaveBeenCalledOnce()
    expect(options.connect).not.toHaveBeenCalled()
    expect(controller.state.micLive).toBe(false)
    expect(options.stop).toHaveBeenCalledOnce()
    controller.setGazeOnly(false)
    expect(options.start).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('fails closed when an established microphone stream stops unexpectedly', () => {
    const { controller, options, receives } = setup()
    controller.setEnabled(true)
    receives[0]!({ kind: 'ready' })
    controller.capture({ generation: 1, live: true, error: false })
    controller.capture({ generation: 1, live: false, error: false })
    expect(controller.state.state).toBe('error')
    expect(options.stop).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('handles a failed port handoff without throwing from a worker callback', () => {
    const { controller, options, receives } = setup()
    options.connect.mockImplementation(() => {
      throw new Error('Worker unavailable')
    })
    controller.setEnabled(true)
    expect(() => receives[0]!({ kind: 'ready' })).not.toThrow()
    expect(controller.state.state).toBe('error')
    controller.dispose()
  })
  it('starts only on demand, connects after ready, and reports actual capture', () => {
    const { controller, options, receives } = setup()
    expect(options.start).not.toHaveBeenCalled()
    controller.setEnabled(true)
    expect(controller.state.state).toBe('loading')
    expect(controller.state.micLive).toBe(false)
    receives[0]!({ kind: 'ready' })
    expect(options.connect).toHaveBeenCalledWith(1)
    controller.capture({ generation: 1, live: true, error: false })
    expect(controller.state.micLive).toBe(true)
    receives[0]!({ kind: 'activity', speaking: true })
    expect(options.activity).toHaveBeenLastCalledWith('speaking')
    receives[0]!({
      kind: 'transcript',
      transcript: { text: '你好', lang: 'yue', tSpeechStart: 1, tSpeechEnd: 2, tDone: 3 }
    })
    expect(options.transcript).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('pause kills audio, rejects stale events, and never automatically restarts', () => {
    const { controller, options, receives, pause } = setup()
    controller.setEnabled(true)
    pause.toggle()
    expect(options.stop).toHaveBeenCalledOnce()
    receives[0]!({ kind: 'ready' })
    controller.capture({ generation: 1, live: true, error: false })
    expect(controller.state.micLive).toBe(false)
    controller.setEnabled(true)
    expect(options.start).toHaveBeenCalledOnce()
    pause.toggle()
    expect(options.start).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('fails closed on capture denial, malformed IPC, worker death or startup timeout', () => {
    vi.useFakeTimers()
    for (const failure of ['capture', 'malformed', 'worker', 'timeout']) {
      const { controller, options, receives } = setup()
      controller.setEnabled(true)
      if (failure === 'capture') controller.capture({ generation: 1, live: false, error: true })
      else if (failure === 'malformed') receives[0]!({ kind: 'audio', samples: [] })
      else if (failure === 'worker') receives[0]!({ kind: 'error' })
      else vi.advanceTimersByTime(120_001)
      expect(controller.state.state).toBe('error')
      expect(controller.state.micLive).toBe(false)
      expect(options.stop).toHaveBeenCalled()
      controller.dispose()
    }
    vi.useRealTimers()
  })
})
