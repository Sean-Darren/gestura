import { describe, expect, it, vi } from 'vitest'
import type { SnapBounds, SnapSettings, PointerDisplay } from '@gestura/core'
import { SnapController } from './controller'
import { createNativeUiQueries } from '../native/ui-elements'
import { PauseController } from '../pause'
import { MockNativeInput } from '@gestura/native/mock'
function setup(
  scale = 1,
  coordinateSpace: PointerDisplay['coordinateSpace'] = scale === 1 ? 'pixels' : 'points',
  reserved = false
): {
  snap: SnapController
  mock: MockNativeInput
  pause: PauseController
  state: SnapSettings[]
  highlights: (SnapBounds | null)[]
  save: ReturnType<typeof vi.fn>
  at(t: number): void
  update(frozen?: boolean): void
  refresh(): Promise<void>
} {
  let t = 1000
  const mock = new MockNativeInput(),
    pause = new PauseController(),
    state: SnapSettings[] = [],
    highlights: (SnapBounds | null)[] = [],
    save = vi.fn().mockResolvedValue(undefined)
  mock.foreground = { appId: 'com.test.app', windowTitle: 'One' }
  mock.layout = [
    {
      bounds: {
        x: 100 / (coordinateSpace === 'points' ? scale : 1),
        y: 100 / (coordinateSpace === 'points' ? scale : 1),
        width: 24 / (coordinateSpace === 'points' ? scale : 1),
        height: 24 / (coordinateSpace === 'points' ? scale : 1)
      },
      role: 'button',
      name: 'Button',
      isClickable: true,
      isEnabled: true,
      isOffscreen: false
    }
  ]
  const ui = createNativeUiQueries(
    pause,
    () => mock,
    undefined,
    () => t
  )
  const snap = new SnapController({
    ui,
    pause,
    now: () => t,
    cacheNow: () => t,
    platform: 'darwin',
    preferences: { version: 1, apps: { 'com.test.app': true } },
    poor: [{ os: 'darwin', appId: 'com.test.poor', reason: 'No usable controls' }],
    publish: (s) => state.push(s),
    highlight: (b) => highlights.push(b),
    save,
    reserved: () => reserved
  })
  const display: PointerDisplay = {
    bounds: { x: 0, y: 0, width: 1920 / scale, height: 1080 / scale },
    scaleFactor: scale,
    coordinateSpace
  }
  const update = (frozen = false): void =>
    snap.update({ x: 125, y: 112 }, display, undefined, frozen)
  return {
    snap,
    mock,
    pause,
    state,
    highlights,
    save,
    at(value) {
      t = value
    },
    update,
    async refresh() {
      snap.tick()
      await vi.waitFor(() =>
        expect(mock.calls.filter((c) => c.method === 'elementsNear')).not.toHaveLength(0)
      )
      await Promise.resolve()
    }
  }
}
describe('cached click snapping', () => {
  it('only reads the cache during movement/click and converts Retina points to physical bounds', async () => {
    const s = setup(2)
    s.update()
    await s.refresh()
    s.update()
    expect(s.highlights.at(-1)).toEqual({ x: 100, y: 100, width: 24, height: 24 })
    const count = s.mock.calls.length
    expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 112, y: 112 })
    s.update()
    expect(s.mock.calls).toHaveLength(count)
    expect(s.mock.calls.filter((c) => c.method === 'elementsNear')[0]?.args).toEqual([62.5, 56, 60])
    s.snap.dispose()
  })
  it('falls back on expiry, pause, unknown apps and disabled preferences', async () => {
    const s = setup()
    s.update()
    await s.refresh()
    s.update()
    s.at(1200)
    expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
    s.pause.toggle()
    expect(s.highlights.at(-1)).toBeNull()
    expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
    s.pause.toggle()
    await s.snap.setPreference({ appId: 'com.test.app', enabled: false })
    expect(s.save).toHaveBeenCalled()
    s.update()
    expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
    s.snap.dispose()
  })
  it('enforces poor coverage even when enabling is requested', async () => {
    const s = setup()
    await s.snap.setPreference({ appId: 'com.test.poor', enabled: true })
    expect(s.save).not.toHaveBeenCalled()
    expect(s.state.at(-1)?.message).toContain('poor')
    s.snap.dispose()
  })
  it('reverts on persistence failure and keeps app IDs only in stored preferences', async () => {
    const s = setup()
    s.save.mockRejectedValueOnce(Error('disk'))
    await s.snap.setPreference({ appId: 'com.test.app', enabled: false })
    expect(s.snap.state.apps[0]?.enabled).toBe(true)
    expect(s.snap.state.message).toContain('Could not save')
    expect(s.save.mock.calls[0]?.[0]).toEqual({ version: 1, apps: { 'com.test.app': false } })
    s.snap.dispose()
  })
  it('clears the frozen highlight when the foreground window changes and never waits on a click', async () => {
    const s = setup()
    s.update()
    await s.refresh()
    s.update()
    s.update(true)
    s.mock.foreground = { appId: 'com.other.app', windowTitle: 'Other' }
    s.at(1100)
    s.update(true)
    s.snap.tick()
    await vi.waitFor(() => expect(s.snap.state.foreground).toBe('com.other.app'))
    expect(s.highlights.at(-1)).toBeNull()
    expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
    s.snap.dispose()
  })
})

it('does not overlap queries or accept a delayed result after pause', async () => {
  const s = setup()
  let finish: ((elements: typeof s.mock.layout) => void) | undefined
  s.mock.elementsNear = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  s.update()
  s.snap.tick()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  const calls = s.mock.calls.length
  s.at(1100)
  s.update()
  s.snap.tick()
  s.snap.tick()
  expect(s.mock.calls).toHaveLength(calls)
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
  s.pause.toggle()
  finish?.(s.mock.layout)
  await Promise.resolve()
  await Promise.resolve()
  expect(s.highlights.at(-1)).toBeNull()
  s.snap.dispose()
})

it('invalidates a blink-frozen target if its bounds change', async () => {
  const s = setup()
  s.update()
  await s.refresh()
  s.update()
  s.update(true)
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 112, y: 112 })
  s.mock.layout[0]!.bounds.x = 140
  s.at(1100)
  s.update(true)
  s.snap.tick()
  await vi.waitFor(() =>
    expect(s.mock.calls.filter((c) => c.method === 'elementsNear')).toHaveLength(2)
  )
  s.update(true)
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
  expect(s.highlights.at(-1)).toBeNull()
  s.snap.dispose()
})

it('revalidates enabled/offscreen state at click time instead of trusting the old selection', async () => {
  const s = setup()
  s.update()
  await s.refresh()
  s.update()
  s.update(true)
  s.mock.layout[0]!.isEnabled = false
  s.at(1100)
  s.snap.tick()
  await vi.waitFor(() =>
    expect(s.mock.calls.filter((c) => c.method === 'elementsNear')).toHaveLength(2)
  )
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
  s.update(true)
  expect(s.highlights.at(-1)).toBeNull()
  s.snap.dispose()
})

it('keeps Windows DPI-aware pixel bounds and query coordinates unchanged', async () => {
  const s = setup(2, 'pixels')
  s.update()
  await s.refresh()
  s.update()
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 112, y: 112 })
  expect(s.mock.calls.filter((c) => c.method === 'elementsNear')[0]?.args).toEqual([125, 112, 60])
  s.snap.dispose()
})

it('never snaps into the reserved pause corner', async () => {
  const s = setup(1, 'pixels', true)
  s.update()
  await s.refresh()
  s.update()
  expect(s.highlights.at(-1)).toBeNull()
  expect(s.snap.click({ x: 125, y: 112 })).toEqual({ x: 125, y: 112 })
  s.snap.dispose()
})
