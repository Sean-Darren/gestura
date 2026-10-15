import { SpeechCaptureStatusSchema, SpeechWorkerEventSchema } from '@gestura/core'
import type { SpeechStatus, Transcript } from '@gestura/core'
import type { PauseController } from '../pause'

export class SpeechController {
  private generation = 0
  private enabled = false
  private status: SpeechStatus = { state: 'off', micLive: false, message: 'Listening is off' }
  private timeout: ReturnType<typeof setTimeout> | undefined
  private readonly unsubscribe: () => void
  constructor(
    private readonly options: {
      pause: PauseController
      start(generation: number, receive: (value: unknown) => void): void
      connect(generation: number): void
      stop(): void
      publish(status: SpeechStatus): void
      transcript(value: Transcript): void
      activity(state: 'unknown' | 'silent' | 'speaking'): void
    }
  ) {
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) this.setEnabled(false)
    })
  }
  get state(): SpeechStatus {
    return this.status
  }
  private publish(
    state: SpeechStatus['state'],
    message: string,
    micLive = this.status.micLive
  ): void {
    this.status = { state, message, micLive }
    this.options.publish(this.status)
  }
  setEnabled(enabled: boolean): void {
    if (enabled && this.options.pause.paused) return
    if (enabled === this.enabled) return
    this.enabled = enabled
    const generation = ++this.generation
    clearTimeout(this.timeout)
    if (!enabled) {
      this.options.stop()
      this.options.activity('unknown')
      this.publish('off', 'Listening is off', false)
      return
    }
    this.publish('loading', 'Loading local speech models', false)
    this.options.activity('unknown')
    this.timeout = setTimeout(() => this.fail(), 30000)
    try {
      this.options.start(generation, (value) => {
        if (!this.enabled || generation !== this.generation || this.options.pause.paused) return
        const result = SpeechWorkerEventSchema.safeParse(value)
        if (!result.success) {
          this.fail()
          return
        }
        const event = result.data
        if (event.kind === 'error') this.fail()
        else if (event.kind === 'ready') {
          this.publish('starting', 'Requesting microphone access')
          try {
            this.options.connect(generation)
          } catch {
            this.fail()
          }
        } else if (event.kind === 'activity') {
          this.options.activity(event.speaking ? 'speaking' : 'silent')
        } else if (this.status.micLive) this.options.transcript(event.transcript)
      })
    } catch {
      this.fail()
    }
  }
  capture(value: unknown): void {
    const parsed = SpeechCaptureStatusSchema.safeParse(value)
    if (!parsed.success || !this.enabled || parsed.data.generation !== this.generation) return
    if (parsed.data.error) {
      this.fail()
      return
    }
    if (parsed.data.live) {
      clearTimeout(this.timeout)
      this.publish('listening', 'Listening locally. Transcripts are previews only.', true)
    } else if (this.status.micLive) this.fail()
  }
  fail(): void {
    this.setEnabled(false)
    this.publish(
      'error',
      'Speech unavailable. Check microphone permission and run pnpm models:fetch. Retry listening.',
      false
    )
  }
  dispose(): void {
    this.setEnabled(false)
    this.unsubscribe()
    clearTimeout(this.timeout)
  }
}
