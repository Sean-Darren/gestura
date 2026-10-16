import { expect, it } from 'vitest'
import { AudioPacketSchema, TranscriptSchema, createIpcEnvelope } from './index'
import { DEFAULT_SPEECH_CONFIG, SpeechConfigSchema } from './config'
it('validates ordered transcript times and refuses audio on the public IPC envelope', () => {
  const transcript = {
    text: '你好 =SUM(A1:A3)',
    lang: 'yue',
    tSpeechStart: 100,
    tSpeechEnd: 200,
    tDone: 300
  }
  expect(TranscriptSchema.parse(transcript)).toEqual(transcript)
  expect(() => TranscriptSchema.parse({ ...transcript, tDone: 199 })).toThrow()
  expect(() =>
    createIpcEnvelope('speech:transcript', {
      ...transcript,
      samples: new Float32Array(512)
    } as typeof transcript)
  ).toThrow()
  expect(() =>
    createIpcEnvelope('speech:capture', { generation: 1, live: true, error: false, audio: [] } as {
      generation: number
      live: boolean
      error: boolean
    })
  ).toThrow()
})
it('bounds PCM packets, control payloads and tunable VAD settings', () => {
  const packet = { seq: 0, tCapture: 100, samples: new Float32Array(512) }
  expect(AudioPacketSchema.safeParse(packet).success).toBe(true)
  for (const samples of [
    new Float32Array(1),
    new Float32Array(512).fill(NaN),
    new Float32Array(512).fill(2)
  ])
    expect(AudioPacketSchema.safeParse({ ...packet, samples }).success).toBe(false)
  expect(() =>
    createIpcEnvelope('speech:control', { enabled: 'true' } as unknown as { enabled: boolean })
  ).toThrow()
  expect(DEFAULT_SPEECH_CONFIG.minSilenceDuration).toBe(0.5)
  expect(SpeechConfigSchema.safeParse({ numThreads: 50 }).success).toBe(false)
})
