import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE_CONFIG, PaletteConfigSchema } from '@gestura/core'
import { PaletteStore } from './store'
describe('local palette preferences', () => {
  it('persists only explicitly saved settings and editable phrases; rejects invalid files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gestura-palette-'))
    try {
      const store = new PaletteStore(dir)
      expect(await store.load(DEFAULT_PALETTE_CONFIG)).toEqual(DEFAULT_PALETTE_CONFIG)
      const config = PaletteConfigSchema.parse({
        gazeOnly: true,
        phrases: [{ id: 'hello', label: '你好', text: '你好' }]
      })
      await store.save(config)
      expect(await store.load(DEFAULT_PALETTE_CONFIG)).toEqual(config)
      expect(await readFile(join(dir, 'palette.json'), 'utf8')).not.toContain('transcript')
      await writeFile(join(dir, 'palette.json'), '{"gazeOnly":"false"}')
      expect(await store.load(DEFAULT_PALETTE_CONFIG)).toEqual(DEFAULT_PALETTE_CONFIG)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
