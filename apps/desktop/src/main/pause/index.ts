export const PAUSE_HOTKEY = 'Control+Alt+P'

export class PauseController {
  private pausedState = false
  private readonly listeners = new Set<(paused: boolean) => void>()

  get paused(): boolean {
    return this.pausedState
  }

  toggle(): boolean {
    this.pausedState = !this.pausedState
    for (const listener of this.listeners) listener(this.pausedState)
    return this.pausedState
  }

  subscribe(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener)
    listener(this.pausedState)
    return () => this.listeners.delete(listener)
  }

  dispatch<T>(operation: () => T): T | undefined {
    if (this.pausedState) return undefined
    return operation()
  }
}

export function pauseAccelerator(platform: NodeJS.Platform): string {
  if (platform !== 'darwin' && platform !== 'win32')
    throw new Error(`Pause hotkey is not configured for ${platform}`)
  return PAUSE_HOTKEY
}
