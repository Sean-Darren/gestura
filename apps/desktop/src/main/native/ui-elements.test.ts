import { describe, expect, it, vi } from 'vitest'
import { MockNativeInput } from '@gestura/native/mock'
import type { UiElement } from '@gestura/core'
import { PauseController } from '../pause'
import { createNativeUiQueries } from './ui-elements'

const button: UiElement = {
  bounds: { x: 100, y: 100, width: 48, height: 48 },
  role: 'button',
  name: 'Save',
  isEnabled: true,
  isOffscreen: false,
  isClickable: true
}
function setup(): {
  mock: MockNativeInput
  pause: PauseController
  ui: ReturnType<typeof createNativeUiQueries>
} {
  const mock = new MockNativeInput()
  mock.layout = [button]
  const pause = new PauseController()
  return { mock, pause, ui: createNativeUiQueries(pause, () => mock) }
}
describe('native UI cache', () => {
  it('hit-tests and caches immutable validated snapshots without querying on reads', async () => {
    const { ui, mock } = setup()
    expect(await ui.elementAt(110, 110)).toEqual(button)
    const snapshot = ui.getCachedElements()
    const calls = mock.calls.length
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot?.elements[0]?.bounds)).toBe(true)
    expect(ui.getCachedElements()).toBe(snapshot)
    expect(mock.calls).toHaveLength(calls)
    expect(await ui.elementAt(0, 0)).toBeNull()
    ui.dispose()
  })
  it('rejects invalid arguments and provider results, clearing the cache on failure', async () => {
    const { ui, mock } = setup()
    await expect(ui.elementsNear(0, 0, -1)).rejects.toThrow()
    expect(mock.calls).toHaveLength(0)
    await ui.elementsNear(100, 100, 100)
    mock.elementsNear = async (): Promise<UiElement[]> => [
      { ...button, bounds: { ...button.bounds, width: -1 } }
    ]
    await expect(ui.elementsNear(100, 100, 100)).rejects.toThrow()
    expect(ui.getCachedElements()).toBeUndefined()
    ui.dispose()
  })
  it('expires snapshots at the configured age', async () => {
    const { mock, pause } = setup()
    let now = 0
    const ui = createNativeUiQueries(
      pause,
      () => mock,
      { cacheMaxAgeMs: 500, timeoutMs: 250, probeRadiusPx: 150 },
      () => now
    )
    await ui.elementsNear(100, 100, 100)
    now = 499
    expect(ui.getCachedElements()).toBeDefined()
    now = 500
    expect(ui.getCachedElements()).toBeUndefined()
    ui.dispose()
  })
  it('drops paused calls and ignores a result that finishes after pause/resume', async () => {
    const { ui, mock, pause } = setup()
    let finish: ((value: UiElement[]) => void) | undefined
    const pending = new Promise<UiElement[]>((resolve) => {
      finish = resolve
    })
    mock.elementsNear = () => pending
    const request = ui.elementsNear(100, 100, 100)
    await Promise.resolve()
    pause.toggle()
    const calls = mock.calls.length
    expect(await ui.elementsNear(100, 100, 100)).toBeUndefined()
    expect(await ui.elementAt(100, 100)).toBeUndefined()
    expect(await ui.foregroundApp()).toBeUndefined()
    expect(mock.calls).toHaveLength(calls)
    pause.toggle()
    finish?.([button])
    expect(await request).toBeUndefined()
    expect(mock.calls).toHaveLength(calls)
    expect(ui.getCachedElements()).toBeUndefined()
    ui.dispose()
  })
  it('keeps newer results when an older query resolves last', async () => {
    const { ui, mock } = setup()
    let finish: ((value: UiElement[]) => void) | undefined
    mock.elementsNear = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<UiElement[]>((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue([])
    const old = ui.elementsNear(100, 100, 100)
    await Promise.resolve()
    expect(await ui.elementsNear(0, 0, 10)).toEqual([])
    finish?.([button])
    expect(await old).toBeUndefined()
    expect(ui.getCachedElements()?.x).toBe(0)
    ui.dispose()
  })
  it('invalidates on foreground changes and rejects mixed foreground results', async () => {
    const { ui, mock } = setup()
    await ui.elementsNear(100, 100, 100)
    mock.foreground = { appId: 'other', windowTitle: 'Other' }
    await ui.foregroundApp()
    expect(ui.getCachedElements()).toBeUndefined()
    mock.elementsNear = async (): Promise<UiElement[]> => {
      mock.foreground = { appId: 'third', windowTitle: 'Third' }
      return [button]
    }
    expect(await ui.elementsNear(100, 100, 100)).toBeUndefined()
    ui.dispose()
  })
  it('times out without publishing a late result and drops disposed calls', async () => {
    const { mock, pause } = setup()
    const ui = createNativeUiQueries(pause, () => mock, {
      cacheMaxAgeMs: 500,
      timeoutMs: 5,
      probeRadiusPx: 150
    })
    let finish: ((value: UiElement[]) => void) | undefined
    mock.elementsNear = () =>
      new Promise<UiElement[]>((resolve) => {
        finish = resolve
      })
    await expect(ui.elementsNear(100, 100, 100)).rejects.toThrow('timed out')
    finish?.([button])
    await Promise.resolve()
    await Promise.resolve()
    expect(ui.getCachedElements()).toBeUndefined()
    ui.dispose()
    expect(await ui.elementAt(100, 100)).toBeUndefined()
    expect(await ui.foregroundApp()).toBeUndefined()
  })
  it('mock applies Retina radius conversion and caps scripted results at 50', async () => {
    const { mock, ui } = setup()
    mock.displays[0] = {
      id: 'retina',
      bounds: { x: 0, y: 0, width: 1000, height: 1000 },
      scaleFactor: 2,
      primary: true,
      coordinateSpace: 'points'
    }
    expect(await mock.elementsNear(0, 100, 150)).toHaveLength(0)
    expect(await mock.elementsNear(0, 100, 200)).toHaveLength(1)
    mock.layout = Array.from({ length: 60 }, (_, i) => ({ ...button, name: `Button ${i}` }))
    expect(await ui.elementsNear(100, 100, 10)).toHaveLength(50)
    ui.dispose()
  })
})
