import { serializeFaceFrame } from '@gestura/core'
import { CameraSource } from './camera'

const source = new CameraSource(
  (status) => window.gestura.send('vision:status', status),
  undefined,
  (value) => window.gestura.send('vision:diagnostics', value)
)
source.subscribe((frame) => window.gestura.send('vision:frame', serializeFaceFrame(frame)))
const unsubscribePause = window.gestura.on('system:pause-state', ({ paused }) =>
  source.setPaused(paused)
)
const unsubscribeControl = window.gestura.on('vision:control', ({ operation }) => {
  if (operation === 'start') void source.start()
  else source.stop()
})
window.addEventListener('beforeunload', () => {
  source.stop()
  unsubscribePause()
  unsubscribeControl()
})
window.gestura.send('app:ready', {})
