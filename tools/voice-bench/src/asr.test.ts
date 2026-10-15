import { readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, describe, expect, it } from 'vitest'
import type { Transcript } from '@gestura/core'
import { SpeechEngine } from '../../../apps/desktop/src/utility/speech/engine'
import { readMonoWav } from './wav'

const enabled = process.env.GESTURA_ASR_TEST === '1'
const root = resolve(import.meta.dirname, '../../..')
const rows: {
  fixture: string
  segments: number
  p50Ms: number
  p95Ms: number
  languages: string
}[] = []
const latencies: number[] = []
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * p) - 1] ?? 0
}
async function runFixture(file: string): Promise<void> {
  const samples = readMonoWav(await readFile(file))
  const transcripts: Transcript[] = []
  let error = false
  const engine = new SpeechEngine({
    directory: resolve(root, 'models/speech'),
    now: () => performance.timeOrigin + performance.now(),
    transcript: (value) => transcripts.push(value),
    activity: () => {},
    error: () => {
      error = true
    }
  })
  const origin = performance.timeOrigin + performance.now()
  try {
    const total = samples.length + 16000
    for (let offset = 0; offset < total; offset += 512) {
      const tCapture = origin + offset / 16
      const wait = tCapture + 32 - (performance.timeOrigin + performance.now())
      if (wait > 0) await delay(wait)
      const packet = new Float32Array(512)
      packet.set(samples.subarray(offset, offset + 512))
      engine.accept(packet, tCapture)
    }
    await engine.flush()
    expect(error).toBe(false)
    expect(transcripts.length).toBeGreaterThan(0)
    expect(transcripts.every((t) => t.text.length > 0 && t.tDone >= t.tSpeechEnd)).toBe(true)
    if (file.endsWith('/yue.wav') || file.endsWith('\\yue.wav'))
      expect(transcripts.map((t) => t.text).join('')).toMatch(/[\u3400-\u9fff]/)
    const timings = transcripts.map((t) => t.tDone - t.tSpeechEnd)
    latencies.push(...timings)
    rows.push({
      fixture: relative(root, file),
      segments: transcripts.length,
      p50Ms: Math.round(percentile(timings, 0.5)),
      p95Ms: Math.round(percentile(timings, 0.95)),
      languages: [...new Set(transcripts.map((t) => t.lang))].join(', ')
    })
    console.log(
      relative(root, file),
      transcripts.map((t) => ({ text: t.text, lang: t.lang }))
    )
  } finally {
    engine.dispose()
  }
}
describe.skipIf(!enabled)('real SenseVoice/Silero WAV replay (pnpm bench:voice)', () => {
  for (const lang of ['en', 'zh', 'yue', 'ja', 'ko'])
    it(`recognizes the pinned ${lang} sample with real-time capture pacing`, async () => {
      await runFixture(resolve(root, 'fixtures/audio/sherpa', `${lang}.wav`))
    }, 180000)
  it('runs supplied consented team fixtures, reporting missing recordings honestly', async (context) => {
    const manifest = JSON.parse(
      await readFile(resolve(root, 'fixtures/audio/team/manifest.json'), 'utf8')
    ) as { files: { file: string; consent: string }[] }
    if (!manifest.files.length) {
      console.log('Team recordings: pending; no consented files supplied.')
      context.skip()
      return
    }
    for (const entry of manifest.files) {
      if (!entry.consent?.trim() || !/^[\w-]+\.wav$/.test(entry.file))
        throw new Error('Team fixture requires consent and a plain WAV filename')
      await runFixture(resolve(root, 'fixtures/audio/team', entry.file))
    }
  }, 600000)
  afterAll(() => {
    process.stdout.write(
      `\n${JSON.stringify({ rows, samples: latencies.length, p50Ms: Math.round(percentile(latencies, 0.5)), p95Ms: Math.round(percentile(latencies, 0.95)) }, null, 2)}\nDetected VAD end, real-time WAV pacing; no microphone. Team recordings pending when manifest is empty.\n`
    )
  })
})
