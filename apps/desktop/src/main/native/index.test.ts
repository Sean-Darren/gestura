import { describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { MockNativeInput } from '@gestura/native/mock'
import { ActionGate } from '../action-gate'
import type { ConfirmedAction } from '../action-gate'
import { PauseController } from '../pause'
import { createNativeInput } from './index'
import { displayLocalDipToNative, primaryCorners } from './coordinates'
import { benchmarkMoves, latencyPercentiles } from './latency'

function confirmed(text: string, gate = new ActionGate()): ConfirmedAction {
  const id = gate.propose({ kind: 'type-text', content: { text } })
  const action = gate.confirm(id, { kind: 'held-mouth-gesture' })
  if (!action) throw new Error('Test confirmation failed')
  return action
}

function setup(): {
  mock: MockNativeInput
  pause: PauseController
  load: () => MockNativeInput
  bridge: ReturnType<typeof createNativeInput>
} {
  const mock = new MockNativeInput()
  const pause = new PauseController()
  const load = vi.fn(() => mock)
  const bridge = createNativeInput(pause, load)
  return { mock, pause, load, bridge }
}

describe('validated native bridge', () => {
  it('rejects invalid arguments before loading the addon', async () => {
    const { bridge, load } = setup()
    expect(() => bridge.moveTo(Number.NaN, 0)).toThrow()
    expect(() => bridge.moveTo(0, Infinity)).toThrow()
    expect(() => bridge.scroll(0.5, 0)).toThrow()
    expect(() => bridge.scroll(10_001, 0)).toThrow()
    expect(() => bridge.click('unknown' as 'left')).toThrow()
    expect(() => bridge.keyCombo(['primary', 'unknown'])).toThrow()
    expect(() => bridge.keyCombo(['primary', 'primary', 's'])).toThrow()
    expect(() => bridge.keyCombo(['primary'])).toThrow()
    expect(() => bridge.keyCombo(['primary', 'control', 's'])).toThrow()
    await expect(bridge.typeText('\0', confirmed('\0'))).rejects.toThrow()
    expect(load).not.toHaveBeenCalled()
  })

  it('drops every native method while paused', async () => {
    const { bridge, mock, pause, load } = setup()
    pause.toggle()
    expect(bridge.moveTo(10, 20)).toBe(false)
    expect(bridge.click('left')).toBe(false)
    expect(bridge.doubleClick()).toBe(false)
    expect(bridge.mouseDown('left')).toBe(false)
    expect(bridge.mouseUp('left')).toBe(false)
    expect(bridge.scroll(1, -1)).toBe(false)
    expect(bridge.keyCombo(['primary', 's'])).toBe(false)
    expect(await bridge.typeText('你好', confirmed('你好'))).toBe(false)
    expect(bridge.getCursorPos()).toBeUndefined()
    expect(bridge.getDisplays()).toBeUndefined()
    expect(bridge.hasInputPermission()).toBeUndefined()
    expect(bridge.requestInputPermission()).toBeUndefined()
    expect(mock.calls).toEqual([])
    expect(load).not.toHaveBeenCalled()
  })

  it('forwards supported input and validates returned data', () => {
    const { bridge, mock } = setup()
    bridge.moveTo(-120.5, 250)
    bridge.click('right')
    bridge.doubleClick()
    bridge.scroll(-2, 3)
    bridge.keyCombo(['primary', 'shift', 's'])
    expect(bridge.getCursorPos()).toEqual({ x: -120.5, y: 250 })
    expect(bridge.getDisplays()).toEqual(mock.displays)
    expect(bridge.hasInputPermission()).toBe(true)
    expect(bridge.requestInputPermission()).toBe(true)
    mock.cursor.x = Number.NaN
    expect(() => bridge.getCursorPos()).toThrow()
  })

  it('requires an exact, fresh, single-use ActionGate confirmation for Unicode text', async () => {
    const { bridge, mock } = setup()
    const text = 'Hello 你好 =SUM(A1:A3) : $ 🐱'
    const action = confirmed(text)
    await expect(bridge.typeText(text, {} as ConfirmedAction)).rejects.toThrow()
    await expect(bridge.typeText('changed', action)).rejects.toThrow()
    await expect(
      bridge.typeText(text, confirmed(text, new ActionGate(() => performance.now() - 60_001)))
    ).rejects.toThrow()
    expect(await bridge.typeText(text, action)).toBe(true)
    expect(
      mock.calls
        .filter((call) => call.method === 'typeText')
        .map((call) => call.args[0])
        .join('')
    ).toBe(text)
    await expect(bridge.typeText(text, action)).rejects.toThrow()
  })

  it('stops ongoing typing and releases drag state when paused', async () => {
    const { bridge, mock, pause } = setup()
    bridge.mouseDown('left')
    const text = '你'.repeat(100)
    const insertion = bridge.typeText(text, confirmed(text))
    pause.toggle()
    expect(await insertion).toBe(false)
    expect(mock.calls.filter((call) => call.method === 'typeText')).toHaveLength(1)
    expect(mock.calls.filter((call) => call.method === 'mouseUp')).toEqual([
      { method: 'mouseUp', args: ['left'] }
    ])
    expect(bridge.mouseUp('left')).toBe(false)
    bridge.dispose()
    pause.toggle()
    expect(bridge.moveTo(0, 0)).toBe(false)
  })

  it('does not resume a partially inserted action after a pause and resume', async () => {
    const { bridge, mock, pause } = setup()
    const text = 'x'.repeat(100)
    const insertion = bridge.typeText(text, confirmed(text))
    pause.toggle()
    pause.toggle()
    expect(await insertion).toBe(false)
    expect(mock.calls.filter((call) => call.method === 'typeText')).toHaveLength(1)
  })
})

describe('native coordinate conversion and benchmark statistics', () => {
  it('stops the benchmark when pause is activated between calls', async () => {
    const { bridge, mock, pause } = setup()
    vi.spyOn(mock, 'moveTo').mockImplementation(() => {
      pause.toggle()
    })
    await expect(benchmarkMoves(bridge)).rejects.toThrow('Benchmark stopped by pause')
    expect(mock.moveTo).toHaveBeenCalledTimes(1)
  })
  it('uses per-display origins and converts DIP to the returned coordinate space', () => {
    const display = new MockNativeInput().displays[0]
    if (!display) throw new Error('Missing fixture display')
    display.bounds.x = -1920
    display.scaleFactor = 1.5
    expect(displayLocalDipToNative(display, 100, 200)).toEqual({ x: -1770, y: 300 })
    display.coordinateSpace = 'points'
    display.scaleFactor = 2
    expect(displayLocalDipToNative(display, 100, 200)).toEqual({ x: -1820, y: 200 })
    expect(primaryCorners(display)[0]).toEqual({ x: -1910, y: 10 })
    expect(primaryCorners(display)[2]).toEqual({ x: -10.5, y: 1069.5 })
  })
  it('reports nearest-rank p50 and p95 over 1,000 samples', () => {
    expect(latencyPercentiles(Array.from({ length: 1_000 }, (_, index) => 1_000 - index))).toEqual({
      p50: 500,
      p95: 950
    })
    expect(() => latencyPercentiles([])).toThrow()
  })
})
