import { BrowserWindow, MessageChannelMain, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { SpeechConfig } from '@gestura/core/config'
import { SpeechPortSchema } from '@gestura/core'

export class SpeechTransport {
  private worker: UtilityProcess | undefined
  private capture: BrowserWindow | undefined
  private rendererReady = false
  private pendingGeneration: number | undefined
  constructor(
    private readonly options: {
      directory: string
      config: SpeechConfig
      createCapture(): BrowserWindow
    }
  ) {}
  get captureId(): number | undefined {
    return this.capture?.webContents.id
  }
  start(generation: number, receive: (value: unknown) => void): void {
    this.stop()
    this.capture = this.options.createCapture()
    this.capture.webContents.once('render-process-gone', () => receive({ kind: 'error' }))
    this.capture.webContents.once('did-fail-load', () => receive({ kind: 'error' }))
    const worker = utilityProcess.fork(
      join(__dirname, 'speech.js'),
      [this.options.directory, JSON.stringify(this.options.config)],
      {
        serviceName: 'Gestura local speech',
        stdio: 'ignore'
      }
    )
    this.worker = worker
    worker.on('message', receive)
    worker.once('exit', () => {
      if (this.worker === worker) receive({ kind: 'error' })
    })
    void generation
  }
  ready(): void {
    this.rendererReady = true
    this.attach()
  }
  connect(generation: number): void {
    this.pendingGeneration = generation
    this.attach()
  }
  private attach(): void {
    if (
      !this.rendererReady ||
      this.pendingGeneration === undefined ||
      !this.worker ||
      !this.capture ||
      this.capture.isDestroyed()
    )
      return
    const descriptor = SpeechPortSchema.parse({ generation: this.pendingGeneration })
    this.pendingGeneration = undefined
    const { port1, port2 } = new MessageChannelMain()
    // Main transfers both endpoints without listening on either audio-bearing port.
    this.worker.postMessage(descriptor, [port1])
    this.capture.webContents.postMessage('gestura:speech-port', descriptor, [port2])
  }
  stop(): void {
    const worker = this.worker
    this.worker = undefined
    this.pendingGeneration = undefined
    this.rendererReady = false
    if (this.capture && !this.capture.isDestroyed()) this.capture.destroy()
    this.capture = undefined
    worker?.kill()
  }
}
