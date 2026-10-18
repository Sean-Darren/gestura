import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AudioAckSchema,
  AudioPacketSchema,
  SpeechPortSchema,
  SpeechWorkerEventSchema
} from '@gestura/core'
import { SpeechConfigSchema } from '@gestura/core/config'
import { SpeechEngine } from './engine'

const parent = process.parentPort
if (!parent) throw new Error('Speech requires an Electron utility process')
const send = (value: unknown): void => parent.postMessage(SpeechWorkerEventSchema.parse(value))
let engine: SpeechEngine | undefined
let attached = false
// Keep event loop alive for the worker's entire lifetime.
// The parent.on('message') listener and port.on('message') listener alone are
// not enough — the utility process exits when the event loop drains between
// MessagePort attachment and the first audio packet arriving.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const keepAlive = setInterval(() => {}, 60_000)
parent.on('message', (event) => {
  if (attached) return
  const descriptor = SpeechPortSchema.safeParse(event.data)
  const port = event.ports[0]
  if (!descriptor.success || !port) return
  attached = true
  let expectedSeq = 0
  port.on('message', (message) => {
    try {
      // Electron 44 MessagePortMain wraps in { data, ports }; a standard
      // Node.js MessagePort delivers the value directly.  Handle both.
      const raw: unknown =
        message != null && typeof message === 'object' && 'data' in message
          ? (message as { data: unknown }).data
          : message
      // Defensive: skip messages that are not plain objects (e.g. null, undefined,
      // or internal Electron events that arrive through the same port).
      if (raw == null || typeof raw !== 'object') {
        console.error(
          '[speech worker] non-object message skipped:',
          raw === null ? 'null' : typeof raw
        )
        return
      }
      const packet = AudioPacketSchema.parse(raw)
      if (packet.seq !== expectedSeq++) throw new Error('Audio packet sequence mismatch')
      engine?.accept(packet.samples, packet.tCapture)
      port.postMessage(AudioAckSchema.parse({ seq: packet.seq }))
    } catch (error) {
      console.error('[speech worker] audio packet error:', error)
      send({ kind: 'error' })
      port.close()
    }
  })
  port.start()
})
try {
  const dir = process.argv[2] ?? ''
  console.error('[speech worker] dir:', dir)
  for (const f of ['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx']) {
    const p = join(dir, f)
    console.error('[speech worker]', f, ':', p, 'exists:', existsSync(p))
  }
  engine = new SpeechEngine({
    directory: dir,
    config: SpeechConfigSchema.parse(JSON.parse(process.argv[3] ?? '{}')),
    now: () => performance.timeOrigin + performance.now(),
    transcript: (transcript) => send({ kind: 'transcript', transcript }),
    activity: (speaking) => send({ kind: 'activity', speaking }),
    error: () => send({ kind: 'error' })
  })
  send({ kind: 'ready' })
} catch (e) {
  console.error('[speech worker] construction error:', e)
  send({ kind: 'error' })
}
