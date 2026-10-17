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
parent.on('message', (event) => {
  if (attached) return
  const descriptor = SpeechPortSchema.safeParse(event.data)
  const port = event.ports[0]
  if (!descriptor.success || !port) return
  attached = true
  let expectedSeq = 0
  port.on('message', (message) => {
    try {
      const packet = AudioPacketSchema.parse(message.data)
      if (packet.seq !== expectedSeq++) throw new Error('Audio packet sequence mismatch')
      engine?.accept(packet.samples, packet.tCapture)
      port.postMessage(AudioAckSchema.parse({ seq: packet.seq }))
    } catch {
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
