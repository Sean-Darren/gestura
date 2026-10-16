import { MonoResampler } from './resampler'
declare const sampleRate: number
declare const currentFrame: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class CaptureProcessor extends AudioWorkletProcessor {
  private destination: MessagePort | undefined
  private resampler: MonoResampler | undefined
  private seq = 0
  private acknowledged = -1
  private stopped = false
  private origin: number | undefined
  private epoch = 0
  constructor() {
    super()
    this.port.onmessage = (
      event: MessageEvent<{ port?: MessagePort; epoch?: number; stop?: boolean }>
    ) => {
      if (event.data.stop) {
        this.stop()
        return
      }
      if (!event.data.port || this.destination) return
      this.destination = event.data.port
      this.epoch = event.data.epoch ?? 0
      this.destination.onmessage = (ack: MessageEvent<unknown>) => {
        const value = ack.data as { seq?: unknown } | null
        if (
          value &&
          Number.isInteger(value.seq) &&
          typeof value.seq === 'number' &&
          value.seq > this.acknowledged &&
          value.seq < this.seq
        )
          this.acknowledged = value.seq
      }
      this.destination.start()
      this.resampler = new MonoResampler(sampleRate, (samples) => {
        if (!this.destination || this.stopped) return
        if (this.seq - this.acknowledged > 32) {
          this.port.postMessage({ error: true })
          this.stop()
          return
        }
        const packet = { seq: this.seq, tCapture: (this.origin ?? 0) + this.seq * 32, samples }
        this.seq++
        this.destination.postMessage(packet, [samples.buffer])
      })
    }
  }
  private stop(): void {
    this.stopped = true
    this.destination?.close()
    this.destination = undefined
    this.resampler = undefined
  }
  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false
    const channels = inputs[0]
    if (channels?.length && this.resampler) {
      this.origin ??= this.epoch + (currentFrame / sampleRate) * 1000
      this.resampler.push(channels)
    }
    return true
  }
}
registerProcessor('gestura-audio', CaptureProcessor)
