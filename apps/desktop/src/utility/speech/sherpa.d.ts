declare module 'sherpa-onnx-node' {
  const sherpa: { OfflineRecognizer: typeof OfflineRecognizer; Vad: typeof Vad }
  export default sherpa
  export interface OfflineStream {
    acceptWaveform(wave: { sampleRate: number; samples: Float32Array }): void
  }
  export interface RecognitionResult {
    text: string
    lang?: string
    language?: string
  }
  export class OfflineRecognizer {
    constructor(config: unknown)
    createStream(): OfflineStream
    decodeAsync(stream: OfflineStream): Promise<RecognitionResult>
  }
  export class Vad {
    constructor(config: unknown, bufferSizeInSeconds: number)
    acceptWaveform(samples: Float32Array): void
    isEmpty(): boolean
    isDetected(): boolean
    front(enableExternalBuffer?: boolean): { start: number; samples: Float32Array }
    pop(): void
    reset(): void
    flush(): void
  }
}
