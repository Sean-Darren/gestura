import { app, globalShortcut } from 'electron'
import { pauseAccelerator } from '../pause'
import { pause, nativeInput } from './runtime'

export async function runNativeTool(operation: () => Promise<void>): Promise<void> {
  await app.whenReady()
  if (!globalShortcut.register(pauseAccelerator(process.platform), () => pause.toggle()))
    throw new Error('The required pause hotkey could not be registered')
  try {
    if (!nativeInput.hasInputPermission()) {
      nativeInput.requestInputPermission()
      throw new Error('Grant Accessibility permission and rerun this command')
    }
    await operation()
  } finally {
    nativeInput.dispose()
    globalShortcut.unregisterAll()
    app.quit()
  }
}
