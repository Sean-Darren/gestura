import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioPacketSchema } from '@gestura/core'

class ProcessorBase {
  readonly port = {
    onmessage: null as ((event: { data: Record<string, unknown> }) => void) | null,
    postMessage: vi.fn()
  }
}
interface ProcessorHarness extends ProcessorBase {
  process(inputs: Float32Array[][]): boolean
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('audio worklet to Electron speech port', () => {
  it('sends independently cloned packets without transferring ArrayBuffers', async () => {
    let Processor: (new () => ProcessorHarness) | undefined
    vi.stubGlobal('AudioWorkletProcessor', ProcessorBase)
    vi.stubGlobal('sampleRate', 48000)
    vi.stubGlobal('currentFrame', 0)
    vi.stubGlobal('registerProcessor', (name: string, constructor: new () => ProcessorHarness) => {
      expect(name).toBe('gestura-audio')
      Processor = constructor
    })
    await import('./worklet')
    if (!Processor) throw new Error('Worklet was not registered')
    const processor = new Processor()
    const packets: unknown[] = []
    const destination = {
      start: vi.fn(),
      close: vi.fn(),
      onmessage: null as ((event: { data: { seq: number } }) => void) | null,
      postMessage: vi.fn((packet: unknown, transfer?: unknown[]) => {
        // Reproduce the utility port limitation without a microphone or Electron.
        if (transfer?.length) throw new Error('Transferred backing buffer cannot be decoded')
        const copy = structuredClone(packet)
        packets.push(copy)
        destination.onmessage?.({ data: { seq: AudioPacketSchema.parse(copy).seq } })
      })
    }
    processor.port.onmessage?.({ data: { port: destination, epoch: 1000 } })
    for (let frame = 0; frame < 60; frame++) {
      vi.stubGlobal('currentFrame', frame * 128)
      expect(processor.process([[new Float32Array(128).fill(0.25)]])).toBe(true)
    }
    expect(packets.length).toBeGreaterThan(2)
    packets.forEach((packet, seq) => {
      const parsed = AudioPacketSchema.parse(packet)
      expect(parsed.seq).toBe(seq)
      expect(parsed.tCapture).toBe(1000 + seq * 32)
      expect(parsed.samples).toHaveLength(512)
    })
    expect(destination.postMessage.mock.calls.every((call) => call.length === 1)).toBe(true)
    expect(AudioPacketSchema.parse(packets[0]).samples.buffer).not.toBe(
      AudioPacketSchema.parse(packets[1]).samples.buffer
    )
    expect(processor.port.postMessage).not.toHaveBeenCalled()
    processor.port.onmessage?.({ data: { stop: true } })
    expect(destination.close).toHaveBeenCalledOnce()
    expect(processor.process([[new Float32Array(128)]])).toBe(false)
  })
})
