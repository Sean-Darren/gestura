import '../../shared/schema-runtime'
import { SpeechPortSchema } from '@gestura/core'
import { AudioCapture } from './capture'

const capture = new AudioCapture((generation, live, error) => {
  window.gestura.send('speech:capture', { generation, live, error })
})
let generation = -1
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return
  const data = event.data as { type?: unknown; descriptor?: unknown }
  if (data.type !== 'gestura:speech-port' || event.ports.length !== 1) return
  const parsed = SpeechPortSchema.safeParse(data.descriptor)
  const port = event.ports[0]!
  if (!parsed.success || parsed.data.generation <= generation) {
    port.close()
    return
  }
  generation = parsed.data.generation
  void capture.start(generation, port)
})
window.addEventListener('beforeunload', () => capture.stop(generation))
window.gestura.send('app:ready', {})
