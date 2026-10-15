import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./worklet.ts?worker&url', () => ({ default: '/assets/worklet.js' }))
import { AudioCapture } from './capture'
afterEach(() => vi.unstubAllGlobals())
it('cancels a pending microphone permission request and stops a late stream', async () => {
  let resolve!: (stream: unknown) => void
  const pending = new Promise<unknown>((r) => {
    resolve = r
  })
  const stop = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => pending } })
  const status = vi.fn()
  const capture = new AudioCapture(status)
  const port = { close: vi.fn() } as unknown as MessagePort
  const task = capture.start(1, port)
  capture.stop(2)
  resolve({ getTracks: () => [{ stop }] })
  await task
  expect(stop).toHaveBeenCalledOnce()
  expect(port.close).toHaveBeenCalledOnce()
  expect(status).not.toHaveBeenCalledWith(1, true, false)
  expect(capture.micLive).toBe(false)
})
it('reports the stream as live, transfers only the dedicated port, and releases all audio resources', async () => {
  const track = { stop: vi.fn(), onended: null }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  const close = vi.fn(),
    disconnect = vi.fn(),
    postMessage = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running'
      currentTime = 0
      destination = {}
      audioWorklet = { addModule: vi.fn(async () => {}) }
      resume = vi.fn(async () => {})
      close = close
      createMediaStreamSource(): { connect: ReturnType<typeof vi.fn> } {
        return { connect: vi.fn() }
      }
    }
  )
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage, onmessage: null }
      connect = vi.fn()
      disconnect = disconnect
    }
  )
  const status = vi.fn()
  const capture = new AudioCapture(status)
  const port = { close: vi.fn() } as unknown as MessagePort
  await capture.start(1, port)
  expect(status).toHaveBeenCalledWith(1, true, false)
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ port }), [port])
  capture.stop(2)
  expect(track.stop).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(capture.micLive).toBe(false)
})
it('reports permission errors without leaving a live stream', async () => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        throw new Error('denied')
      })
    }
  })
  const status = vi.fn()
  const capture = new AudioCapture(status)
  await capture.start(1, { close: vi.fn() } as unknown as MessagePort)
  expect(status).toHaveBeenLastCalledWith(1, false, true)
  expect(capture.micLive).toBe(false)
})
