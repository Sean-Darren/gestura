import { join } from 'node:path'
import sherpa from 'sherpa-onnx-node'
import type { OfflineRecognizer, Vad } from 'sherpa-onnx-node'
import { TranscriptSchema } from '@gestura/core'
import type { Transcript } from '@gestura/core'
import { SpeechConfigSchema, DEFAULT_SPEECH_CONFIG } from '@gestura/core/config'
import type { SpeechConfig } from '@gestura/core/config'
import { traditionalHongKong } from './normalize'

export class SpeechEngine {
  private readonly recognizer: OfflineRecognizer
  private readonly vad: Vad
  private origin: number | undefined
  private count = 0
  private disposed = false
  private queue: { start: number; samples: Float32Array }[] = []
  private decoding = false
  private task: Promise<void> = Promise.resolve()
  constructor(
    private readonly options: {
      directory: string
      now(): number
      transcript(value: Transcript): void
      activity(speaking: boolean): void
      error(): void
      config?: SpeechConfig
    }
  ) {
    const config = SpeechConfigSchema.parse(options.config ?? DEFAULT_SPEECH_CONFIG)
    this.recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: join(options.directory, 'model.int8.onnx'),
          language: '',
          useInverseTextNormalization: 1
        },
        tokens: join(options.directory, 'tokens.txt'),
        numThreads: config.numThreads,
        provider: 'cpu',
        debug: 0
      }
    })
    this.vad = new sherpa.Vad(
      {
        sileroVad: {
          model: join(options.directory, 'silero_vad.onnx'),
          threshold: config.threshold,
          minSilenceDuration: config.minSilenceDuration,
          minSpeechDuration: config.minSpeechDuration,
          maxSpeechDuration: config.maxSpeechDuration,
          windowSize: 512
        },
        sampleRate: 16000,
        numThreads: 1,
        provider: 'cpu',
        debug: 0
      },
      30
    )
  }
  accept(samples: Float32Array, tCapture: number): void {
    if (this.disposed) return
    this.origin ??= tCapture
    // Capture packets must form one contiguous sample timeline. Never join audio across gaps.
    const expected = this.origin + this.count / 16
    if (Math.abs(tCapture - expected) > 100) throw new Error('Discontinuous audio stream')
    this.count += samples.length
    this.vad.acceptWaveform(samples)
    this.options.activity(this.vad.isDetected())
    this.drain()
  }
  private drain(): void {
    while (!this.vad.isEmpty()) {
      // Copy before pop: native external buffers otherwise outlive VAD storage.
      const segment = this.vad.front(false)
      this.queue.push({ start: segment.start, samples: new Float32Array(segment.samples) })
      this.vad.pop()
      if (this.queue.length > 2) throw new Error('Speech processing cannot keep up')
    }
    if (!this.decoding && this.queue.length) this.task = this.decode()
  }
  private async decode(): Promise<void> {
    this.decoding = true
    try {
      while (!this.disposed && this.queue.length) {
        const segment = this.queue.shift()!
        const stream = this.recognizer.createStream()
        stream.acceptWaveform({ sampleRate: 16000, samples: segment.samples })
        const result = await this.recognizer.decodeAsync(stream)
        if (this.disposed || this.origin === undefined) return
        const text = traditionalHongKong(result.text.replace(/<\|[^|]*\|>/g, '').trim())
        if (!text) continue
        const tSpeechStart = this.origin + segment.start / 16
        const tSpeechEnd = tSpeechStart + segment.samples.length / 16
        const value = TranscriptSchema.parse({
          text,
          lang: result.lang || result.language || 'unknown',
          tSpeechStart,
          tSpeechEnd,
          tDone: this.options.now()
        })
        this.options.transcript(value)
      }
    } catch {
      if (!this.disposed) this.options.error()
    } finally {
      this.decoding = false
    }
  }
  async flush(): Promise<void> {
    this.vad.flush()
    this.drain()
    await this.task
  }
  dispose(): void {
    this.disposed = true
    this.queue.length = 0
    this.vad.reset()
  }
}
