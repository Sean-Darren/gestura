/** Streaming windowed-sinc resampler. A short history crosses render-quantum boundaries. */
export class MonoResampler {
  private buffer: number[] = Array(16).fill(0)
  private position = 16
  private output = new Float32Array(512)
  private used = 0
  constructor(
    private readonly inputRate: number,
    private readonly emit: (samples: Float32Array) => void
  ) {
    if (!Number.isFinite(inputRate) || inputRate < 16000 || inputRate > 192000)
      throw new Error('Unsupported microphone sample rate')
  }
  push(channels: readonly Float32Array[]): void {
    const length = channels[0]?.length ?? 0
    for (let i = 0; i < length; i++) {
      let mono = 0
      for (const channel of channels) mono += channel[i] ?? 0
      this.buffer.push(mono / channels.length)
    }
    const cutoff = Math.min(1, 16000 / this.inputRate) * 0.9
    while (this.position + 16 < this.buffer.length) {
      let sum = 0,
        weight = 0
      const center = Math.floor(this.position)
      for (let j = center - 15; j <= center + 16; j++) {
        const delta = j - this.position
        const x = Math.PI * delta * cutoff
        const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x
        const w = sinc * (0.5 + 0.5 * Math.cos((Math.PI * delta) / 16))
        sum += (this.buffer[j] ?? 0) * w
        weight += w
      }
      this.output[this.used++] = Math.max(-1, Math.min(1, sum / weight))
      this.position += this.inputRate / 16000
      if (this.used === 512) {
        this.emit(this.output)
        this.output = new Float32Array(512)
        this.used = 0
      }
    }
    const discard = Math.max(0, Math.floor(this.position) - 16)
    this.buffer.splice(0, discard)
    this.position -= discard
  }
}
