import { FaceFrameSchema } from '@gestura/core'
import type { FaceFrame, VisionStatus, IpcPayloadFor } from '@gestura/core'
import { DEFAULT_VISION_CONFIG } from '@gestura/core/config'
import { FrameBus, FixturePlayer, ScriptedRecorder } from '@gestura/replay'
import type { RecordedSession, ReplayClock, FrameSource } from '@gestura/replay'
import type { PauseController } from '../pause'
import { FaceMetrics } from './metrics'

export class RendererFrameSource implements FrameSource {
  private readonly bus = new FrameBus()
  private active = false
  private paused = false
  constructor(private readonly command: (operation: 'start' | 'stop') => void) {}
  subscribe(listener: (frame: FaceFrame) => void): () => void {
    return this.bus.subscribe(listener)
  }
  start(): void {
    this.active = true
    this.command('start')
  }
  stop(): void {
    this.active = false
    this.command('stop')
  }
  setPaused(paused: boolean): void {
    this.paused = paused
  }
  receive(frame: FaceFrame): void {
    if (this.active && !this.paused) this.bus.emit(FaceFrameSchema.parse(frame))
  }
}
export interface VisionControllerOptions {
  pause: PauseController
  clock: ReplayClock
  camera(operation: 'start' | 'stop'): void
  status(value: VisionStatus): void
  metrics(value: IpcPayloadFor<'vision:metrics'>): void
  prompt(value: IpcPayloadFor<'replay:prompt'>): void
  save(session: RecordedSession): Promise<string>
  open(): Promise<FaceFrame[] | undefined>
}
export class VisionController {
  readonly live: RendererFrameSource
  readonly frames = new FrameBus()
  private readonly metrics = new FaceMetrics()
  private readonly unsubscribePause: () => void
  private readonly unsubscribeLive: () => void
  private unsubscribePlayer: (() => void) | undefined
  private player: FixturePlayer | undefined
  private recorder: ScriptedRecorder | undefined
  private running = false
  private disposed = false
  private operation = 0
  private lastMetrics = 0
  constructor(private readonly options: VisionControllerOptions) {
    this.live = new RendererFrameSource((operation) => options.camera(operation))
    this.unsubscribeLive = this.live.subscribe((frame) => this.consume(frame))
    this.unsubscribePause = options.pause.subscribe((paused) => {
      this.live.setPaused(paused)
      this.player?.setPaused(paused)
      this.recorder?.setPaused(paused, options.clock.now())
      if (paused) {
        this.metrics.reset()
        this.clearMetrics()
        this.publishPrompt()
      }
    })
  }
  private clearMetrics(): void {
    this.options.metrics({
      fps: 0,
      inferenceP50Ms: 0,
      inferenceP95Ms: 0,
      faceDetected: false,
      eyeBlinkLeft: 0,
      eyeBlinkRight: 0,
      jawOpen: 0
    })
  }
  private consume(frame: FaceFrame): void {
    if (this.disposed || this.options.pause.paused) return
    this.frames.emit(frame)
    this.recorder?.append(frame)
    const metrics = this.metrics.add(frame)
    const now = this.options.clock.now()
    if (now - this.lastMetrics >= DEFAULT_VISION_CONFIG.metricsIntervalMs) {
      this.options.metrics(metrics)
      this.lastMetrics = now
    }
  }
  receive(frame: FaceFrame): void {
    this.live.receive(frame)
  }
  receiveStatus(status: VisionStatus): void {
    if (this.disposed || this.player) return
    this.running = status.state === 'running'
    this.options.status(status)
    if (status.state === 'stopped' || status.state === 'error') {
      this.metrics.reset()
      this.clearMetrics()
      if (this.recorder)
        this.fail(new Error(status.message || 'Tracking stopped before recording finished'))
    }
  }
  start(): void {
    if (this.disposed || this.options.pause.paused) return
    this.cancelReplay()
    this.metrics.reset()
    this.clearMetrics()
    this.live.start()
  }
  stop(): void {
    if (this.disposed) return
    this.operation++
    this.live.stop()
    this.cancelReplay()
    this.recorder = undefined
    this.running = false
    this.metrics.reset()
    this.clearMetrics()
    this.idlePrompt()
  }
  private cancelReplay(): void {
    this.player?.stop()
    this.player = undefined
    this.unsubscribePlayer?.()
    this.unsubscribePlayer = undefined
  }
  record(): void {
    if (this.disposed || this.options.pause.paused) return
    if (!this.running || this.player || this.recorder)
      throw new Error('Start camera tracking before recording a session')
    this.recorder = new ScriptedRecorder(
      this.options.clock.now(),
      DEFAULT_VISION_CONFIG.recordingPromptMs
    )
    this.publishPrompt()
  }
  tick(): void {
    if (!this.recorder || this.disposed) return
    try {
      if (this.recorder.tick(this.options.clock.now()).done) void this.saveRecording()
      else this.publishPrompt()
    } catch (error) {
      this.fail(error)
    }
  }
  private publishPrompt(): void {
    if (!this.recorder) return
    const { prompt, index, total, remainingMs } = this.recorder.tick(this.options.clock.now())
    this.options.prompt({
      prompt,
      index,
      total,
      remainingMs,
      state: this.options.pause.paused ? 'paused' : 'recording'
    })
  }
  private idlePrompt(): void {
    this.options.prompt({ prompt: '', index: 0, total: 0, remainingMs: 0, state: 'idle' })
  }
  async saveRecording(): Promise<void> {
    if (!this.recorder || this.disposed) return
    const recorder = this.recorder
    this.recorder = undefined
    const operation = ++this.operation
    try {
      const location = await this.options.save(recorder.finish(this.options.clock.now()))
      if (!this.disposed && this.operation === operation)
        this.options.prompt({
          prompt: `Saved locally: ${location}`.slice(0, 500),
          index: 0,
          total: 0,
          remainingMs: 0,
          state: 'saved'
        })
    } catch (error) {
      if (!this.disposed && this.operation === operation) this.fail(error)
    }
  }
  async play(): Promise<void> {
    if (this.disposed || this.options.pause.paused) return
    if (this.recorder) throw new Error('Stop or cancel recording before replay')
    this.live.stop()
    this.cancelReplay()
    this.running = false
    this.metrics.reset()
    this.clearMetrics()
    const operation = ++this.operation
    const frames = await this.options.open()
    if (!frames || this.disposed || operation !== this.operation || this.options.pause.paused)
      return
    this.player = new FixturePlayer(frames, this.options.clock, () => {
      this.cancelReplay()
      this.idlePrompt()
      this.options.status({
        state: 'stopped',
        message: 'Fixture replay finished',
        width: 0,
        height: 0,
        cameraFps: 0
      })
    })
    this.unsubscribePlayer = this.player.subscribe((frame) => this.consume(frame))
    this.options.status({
      state: 'replaying',
      message: 'Replaying derived fixture data; camera is off',
      width: 0,
      height: 0,
      cameraFps: 0
    })
    this.options.prompt({
      prompt: 'Replaying fixture with original timing',
      index: 0,
      total: 0,
      remainingMs: 0,
      state: 'replaying'
    })
    this.player.start()
  }
  fail(error: unknown): void {
    this.recorder = undefined
    this.options.prompt({
      prompt: (error instanceof Error ? error.message : 'Fixture operation failed').slice(0, 500),
      index: 0,
      total: 0,
      remainingMs: 0,
      state: 'error'
    })
  }
  dispose(): void {
    this.stop()
    this.disposed = true
    this.unsubscribePause()
    this.unsubscribeLive()
  }
}
