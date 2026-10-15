import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SnapStore } from './store'
it('stores only explicit app-ID preferences and defaults to off for missing or invalid files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gestura-snap-'))
  try {
    const store = new SnapStore(dir)
    expect(await store.load()).toEqual({ version: 1, apps: {} })
    await store.save({ version: 1, apps: { 'com.test.app': true } })
    expect(await store.load()).toEqual({ version: 1, apps: { 'com.test.app': true } })
    expect(JSON.parse(await readFile(join(dir, 'snap-preferences.json'), 'utf8'))).toEqual({
      version: 1,
      apps: { 'com.test.app': true }
    })
    await writeFile(join(dir, 'snap-preferences.json'), '{"version":2}')
    expect(await store.load()).toEqual({ version: 1, apps: {} })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
