import { afterEach, describe, expect, it, vi } from 'vitest'
import { VisionController } from './controller'
import { PauseController } from '../pause'
import type { FaceFrame } from '@gestura/core'
const frame = (t: number): FaceFrame => ({
  tCapture: t,
  tInferDone: t + 5,
  faceDetected: false,
  landmarks: new Float32Array(1434),
  matrix: new Float32Array(16),
  blendshapes: {}
})
function setup(): {
  controller: VisionController
  pause: PauseController
  camera: ReturnType<typeof vi.fn>
  metrics: ReturnType<typeof vi.fn>
  prompt: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
} {
  const pause = new PauseController(),
    camera = vi.fn(),
    metrics = vi.fn(),
    prompt = vi.fn(),
    save = vi.fn().mockResolvedValue('/local/session'),
    status = vi.fn()
  const controller = new VisionController({
    pause,
    camera,
    metrics,
    prompt,
    save,
    status,
    open: async () => [frame(0), frame(100)],
    clock: {
      now: () => Date.now(),
      schedule: (cb, delay) => {
        const timer = setTimeout(cb, delay)
        return () => clearTimeout(timer)
      }
    }
  })
  return { controller, pause, camera, metrics, prompt, save, status }
}
afterEach(() => vi.useRealTimers())
describe('main live/replay interface', () => {
  it('shows a camera-process startup failure instead of waiting silently', () => {
    vi.useFakeTimers()
    const { controller, status, camera } = setup()
    controller.start()
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'starting' }))
    vi.advanceTimersByTime(10000)
    expect(status).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: 'error',
        message: expect.stringContaining('did not respond')
      })
    )
    expect(camera).toHaveBeenLastCalledWith('stop')
    controller.dispose()
  })
  it('waits for OS permission after the camera process acknowledges startup', () => {
    vi.useFakeTimers()
    const { controller, status } = setup()
    controller.start()
    controller.receiveStatus({
      state: 'starting',
      message: 'Requesting permission',
      width: 0,
      height: 0,
      cameraFps: 0
    })
    vi.advanceTimersByTime(30000)
    expect(status).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Requesting permission' })
    )
    controller.dispose()
  })
  it('cancels the startup timeout when stopped or disposed', () => {
    vi.useFakeTimers()
    const { controller, status } = setup()
    controller.start()
    controller.stop()
    const calls = status.mock.calls.length
    vi.advanceTimersByTime(10000)
    expect(status).toHaveBeenCalledTimes(calls)
    controller.start()
    controller.dispose()
    const disposedCalls = status.mock.calls.length
    vi.advanceTimersByTime(10000)
    expect(status).toHaveBeenCalledTimes(disposedCalls)
  })
  it('aborts an unfinished recording after a camera error', () => {
    const { controller, save, prompt } = setup()
    controller.start()
    controller.receiveStatus({
      state: 'running',
      message: '',
      width: 1280,
      height: 720,
      cameraFps: 60
    })
    controller.record()
    controller.receiveStatus({
      state: 'error',
      message: 'Camera disconnected',
      width: 0,
      height: 0,
      cameraFps: 0
    })
    controller.tick()
    expect(save).not.toHaveBeenCalled()
    expect(prompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'error', prompt: 'Camera disconnected' })
    )
    controller.dispose()
  })
  it('uses one frame stream for live and replay, while pause drops all frames', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { controller, pause, camera } = setup(),
      received = vi.fn()
    controller.frames.subscribe(received)
    controller.start()
    controller.receive(frame(1000))
    expect(received).toHaveBeenCalledOnce()
    pause.toggle()
    controller.receive(frame(1010))
    expect(received).toHaveBeenCalledOnce()
    pause.toggle()
    await controller.play()
    vi.advanceTimersByTime(0)
    expect(camera).toHaveBeenLastCalledWith('stop')
    expect(received).toHaveBeenCalledTimes(2)
    pause.toggle()
    vi.advanceTimersByTime(1000)
    expect(received).toHaveBeenCalledTimes(2)
    pause.toggle()
    vi.advanceTimersByTime(100)
    expect(received).toHaveBeenCalledTimes(3)
    controller.dispose()
  })
  it('saves a derived scripted session only after an explicit recording request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { controller, save } = setup()
    expect(() => controller.record()).toThrow('Start camera')
    controller.start()
    controller.receiveStatus({
      state: 'running',
      message: '',
      width: 1280,
      height: 720,
      cameraFps: 60
    })
    controller.record()
    controller.receive(frame(1000))
    vi.setSystemTime(2000)
    await controller.saveRecording()
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[0].jsonl).not.toContain('pixels')
    controller.dispose()
  })
  it('cancels recording without saving and drops frames after dispose', () => {
    const { controller, save } = setup(),
      listener = vi.fn()
    controller.frames.subscribe(listener)
    controller.start()
    controller.receiveStatus({ state: 'running', message: '', width: 1, height: 1, cameraFps: 30 })
    controller.record()
    controller.stop()
    controller.dispose()
    controller.receive(frame(1))
    expect(save).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })
})
