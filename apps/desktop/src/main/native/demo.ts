import { app } from 'electron'
import { setTimeout } from 'node:timers/promises'
import { ActionGate } from '../action-gate'
import { primaryCorners } from './coordinates'
import { nativeInput } from './runtime'
import { runNativeTool } from './tool-runtime'

void runNativeTool(async () => {
  const display = nativeInput.getDisplays()?.find((item) => item.primary)
  if (!display) throw new Error('No primary display is available')
  console.log('Native demo: pause at any time with Ctrl+Option+P / Ctrl+Alt+P.')
  for (let remaining = 5; remaining > 0; remaining--) {
    console.log(`Cursor demo starts in ${remaining} seconds`)
    await setTimeout(1_000)
  }
  for (const point of primaryCorners(display)) {
    if (!nativeInput.moveTo(point.x, point.y)) throw new Error('Demo stopped by pause')
    await setTimeout(500)
  }
  const text = 'Hello 你好 =SUM(A1:A3)'
  const gate = new ActionGate()
  const id = gate.propose({ kind: 'type-text', content: { text } })
  console.log(`Text proposal ${id}: ${text}`)
  console.log(
    'Typing is pending: Q4 requires voice or held-mouth confirmation, and neither pipeline exists yet. No text was inserted.'
  )
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
