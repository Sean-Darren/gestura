import { readFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { SpeechEngine } from '../../../apps/desktop/src/utility/speech/engine'
import { repoRoot } from './catalogue'
import { readMonoWav } from './wav'
import type { Transcript } from '@gestura/core'

export async function transcribeFixture(
  audio: string
): Promise<{ text: string; tSpeechStart: number }> {
  const root = await realpath(resolve(repoRoot, 'fixtures/audio'))
  const file = await realpath(resolve(root, audio))
  const local = relative(root, file)
  if (local.startsWith('..') || isAbsolute(local) || !local.toLowerCase().endsWith('.wav'))
    throw new Error('Audio must be a WAV inside fixtures/audio')
  if (local.replaceAll('\\', '/').startsWith('team/')) {
    const manifest = JSON.parse(await readFile(resolve(root, 'team/manifest.json'), 'utf8')) as {
      files: { file: string; consent: string }[]
    }
    if (!manifest.files.some((entry) => entry.file === local.slice(5) && entry.consent?.trim()))
      throw new Error('Team audio requires a consent-manifest entry')
  }
  const samples = readMonoWav(await readFile(file))
  const results: Transcript[] = []
  let failed = false
  const engine = new SpeechEngine({
    directory: resolve(repoRoot, 'models/speech'),
    now: () => performance.timeOrigin + performance.now(),
    transcript: (value) => results.push(value),
    activity: () => {},
    error: () => {
      failed = true
    }
  })
  const origin = performance.timeOrigin + performance.now()
  try {
    for (let offset = 0; offset < samples.length + 16000; offset += 512) {
      const tCapture = origin + offset / 16
      const wait = tCapture + 32 - (performance.timeOrigin + performance.now())
      if (wait > 0) await delay(wait)
      const packet = new Float32Array(512)
      packet.set(samples.subarray(offset, offset + 512))
      engine.accept(packet, tCapture)
      if (failed) throw new Error('ASR failed')
    }
    await engine.flush()
    if (failed || !results.length) throw new Error('ASR returned no transcript')
    return {
      text: results.map((value) => value.text).join(' '),
      tSpeechStart: results[0]!.tSpeechStart
    }
  } finally {
    engine.dispose()
  }
}
