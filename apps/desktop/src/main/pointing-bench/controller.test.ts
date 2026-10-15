import { describe, expect, it, vi } from 'vitest'
import { BenchConfigSchema } from '@gestura/core'
import { BenchController } from './controller'
import { BenchStore } from './store'
import { PauseController } from '../pause'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const config = BenchConfigSchema.parse({
  mode: 'standard',
  width: 800,
  height: 500,
  scaleFactor: 1
})
describe('local benchmark controller and store', () => {
  it('does not save without opt-in, excludes paused clicks, and deletes memory', async () => {
    const pause = new PauseController(),
      save = vi.fn(),
      clear = vi.fn()
    let time = 1000
    const c = new BenchController({ pause, now: () => time, publish: () => {}, save, clear })
    await c.control({ operation: 'start', config })
    pause.toggle()
    time = 1100
    await c.control({ operation: 'click', x: 0, y: 0, button: 0 })
    expect(c.state.index).toBe(0)
    pause.toggle()
    time = 1200
    c.sample(1200, 20)
    await c.control({ operation: 'click', x: 0, y: 0, button: 0 })
    await c.control({ operation: 'cancel' })
    expect(c.state.report).toContain('| 16 | 1 |')
    expect(save).not.toHaveBeenCalled()
    await c.control({ operation: 'delete' })
    expect(clear).toHaveBeenCalledOnce()
    expect(c.state.report).toBe('')
    c.dispose()
  })
  it('writes opt-in JSON and Markdown, orders deletion after writes and preserves unrelated files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gestura-pointing-'))
    try {
      const store = new BenchStore(dir),
        pause = new PauseController()
      const c = new BenchController({
        pause,
        now: () => 1000,
        publish: () => {},
        save: (s) => store.save(s),
        clear: () => store.clear()
      })
      await c.control({ operation: 'start', config: { ...config, persist: true } })
      await c.control({ operation: 'click', x: 0, y: 0, button: 0 })
      await c.control({ operation: 'cancel' })
      expect(JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8')).rows[0].misses).toBe(1)
      expect(await readFile(join(dir, 'summary.md'), 'utf8')).toContain('False-click %')
      await writeFile(join(dir, 'keep.txt'), 'keep')
      await c.control({ operation: 'delete' })
      expect(await readdir(dir)).toEqual(['keep.txt'])
      c.dispose()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('shows recoverable storage errors instead of claiming success', async () => {
    const c = new BenchController({
      pause: new PauseController(),
      now: () => 100,
      publish: () => {},
      save: async () => {
        throw Error('disk')
      },
      clear: async () => {
        throw Error('disk')
      }
    })
    await c.control({ operation: 'start', config: { ...config, persist: true } })
    await c.control({ operation: 'cancel' })
    expect(c.state.message).toContain('Could not save')
    await c.control({ operation: 'delete' })
    expect(c.state.message).toContain('Could not delete')
    c.dispose()
  })
})

it('does not write without opt-in and serializes delete after an in-flight save', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gestura-bench-race-'))
  try {
    const store = new BenchStore(dir),
      session = {
        version: 1 as const,
        config,
        startedAt: 0,
        endedAt: 10,
        trials: [],
        status: 'cancelled' as const
      }
    await store.save(session)
    expect(await readdir(dir)).toEqual([])
    await Promise.all([
      store.save({ ...session, config: { ...config, persist: true } }),
      store.clear()
    ])
    expect(await readdir(dir)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('settles in-flight reports before the window or app may close', async () => {
  let finish: (() => void) | undefined
  const save = (): Promise<void> =>
    new Promise<void>((resolve) => {
      finish = resolve
    })
  const c = new BenchController({
    pause: new PauseController(),
    now: () => 10,
    publish: () => {},
    save,
    clear: async () => {}
  })
  await c.control({ operation: 'start', config: { ...config, persist: true } })
  const ending = c.control({ operation: 'cancel' })
  let settled = false
  const closing = c.settle().then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  finish?.()
  await ending
  await closing
  expect(settled).toBe(true)
  c.dispose()
})
