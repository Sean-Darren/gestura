import { describe, expect, it, vi } from 'vitest'
import { PauseController, pauseAccelerator } from './index'

describe('global pause state', () => {
  it('toggles and broadcasts every state change to subscribers', () => {
    const pause = new PauseController()
    const listener = vi.fn()
    const unsubscribe = pause.subscribe(listener)

    expect(pause.paused).toBe(false)
    expect(pause.toggle()).toBe(true)
    expect(pause.paused).toBe(true)
    expect(pause.toggle()).toBe(false)
    expect(listener.mock.calls).toEqual([[false], [true], [false]])
    unsubscribe()
    pause.toggle()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('suppresses cursor or click operations while paused', () => {
    const pause = new PauseController()
    const sendInput = vi.fn()

    pause.dispatch(sendInput)
    pause.toggle()
    pause.dispatch(sendInput)
    expect(sendInput).toHaveBeenCalledTimes(1)
  })

  it('uses Ctrl+Option+P on macOS and Ctrl+Alt+P on Windows', () => {
    expect(pauseAccelerator('darwin')).toBe('Control+Alt+P')
    expect(pauseAccelerator('win32')).toBe('Control+Alt+P')
  })
})
