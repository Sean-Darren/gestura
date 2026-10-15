import workletUrl from './worklet.ts?worker&url'
export class AudioCapture {
  private generation = 0
  private stream: MediaStream | undefined
  private context: AudioContext | undefined
  private node: AudioWorkletNode | undefined
  private live = false
  constructor(
    private readonly status: (generation: number, live: boolean, error: boolean) => void
  ) {}
  stop(generation: number): void {
    this.generation = generation
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    this.node?.port.postMessage({ stop: true })
    this.node?.disconnect()
    this.node = undefined
    void this.context?.close()
    this.context = undefined
    this.live = false
    this.status(generation, false, false)
  }
  async start(generation: number, port: MessagePort): Promise<void> {
    this.stop(generation)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        port.close()
        return
      }
      this.stream = stream
      // Report the real stream immediately, including while the worklet initializes.
      this.live = true
      this.status(generation, true, false)
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          if (generation === this.generation) {
            this.stop(generation)
            this.status(generation, false, true)
          }
        }
      const context = new AudioContext({ latencyHint: 'interactive' })
      this.context = context
      await context.audioWorklet.addModule(workletUrl)
      await context.resume()
      if (generation !== this.generation) {
        port.close()
        return
      }
      if (context.state !== 'running') throw new Error('Audio context could not start')
      const node = new AudioWorkletNode(context, 'gestura-audio')
      this.node = node
      node.port.onmessage = () => {
        if (generation === this.generation) {
          this.stop(generation)
          this.status(generation, false, true)
        }
      }
      node.onprocessorerror = () => {
        if (generation === this.generation) {
          this.stop(generation)
          this.status(generation, false, true)
        }
      }
      node.port.postMessage(
        { port, epoch: performance.timeOrigin + performance.now() - context.currentTime * 1000 },
        [port]
      )
      context.createMediaStreamSource(stream).connect(node)
      node.connect(context.destination)
    } catch {
      port.close()
      if (generation === this.generation) {
        this.stop(generation)
        this.status(generation, false, true)
      }
    }
  }
  get micLive(): boolean {
    return this.live
  }
}
