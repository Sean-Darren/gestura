import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GesturaApi } from '../../preload/types'
import { connectDesktop } from './desktop-connection'

afterEach(() => vi.useRealTimers())
describe('desktop connection', () => {
  it('reports a missing preload instead of exposing inert controls', () => {
    const update = vi.fn()
    connectDesktop(undefined, update)()
    expect(update.mock.calls.map(([state]) => state)).toEqual(['connecting', 'unavailable'])
  })
  it('times out an unresponsive main process and removes its listener', () => {
    vi.useFakeTimers()
    const off = vi.fn(),
      update = vi.fn()
    const api = { on: vi.fn(() => off), send: vi.fn() } satisfies GesturaApi
    const stop = connectDesktop(api, update)
    expect(api.send).toHaveBeenCalledWith('app:ready', {})
    vi.advanceTimersByTime(5000)
    expect(update).toHaveBeenLastCalledWith('unavailable')
    stop()
    expect(off).toHaveBeenCalledOnce()
  })
  it('accepts an acknowledgement and clears the timeout', () => {
    vi.useFakeTimers()
    const update = vi.fn()
    const api: GesturaApi = {
      on: (_channel, callback) => {
        // Keep the generic IPC callback intact; deliver through the test bridge below.
        listeners.push(() => callback({ status: 'ready' } as never))
        return vi.fn()
      },
      send: vi.fn()
    }
    const listeners: (() => void)[] = []
    const stop = connectDesktop(api, update)
    listeners[0]!()
    vi.advanceTimersByTime(6000)
    expect(update).toHaveBeenLastCalledWith('ready')
    stop()
    listeners[0]!()
    expect(update).toHaveBeenCalledTimes(2)
  })
  it('reports synchronous IPC failure', () => {
    const update = vi.fn()
    const api = {
      on: vi.fn(() => vi.fn()),
      send: vi.fn(() => {
        throw new Error('closed')
      })
    } satisfies GesturaApi
    connectDesktop(api, update)()
    expect(update).toHaveBeenLastCalledWith('unavailable')
  })
})
