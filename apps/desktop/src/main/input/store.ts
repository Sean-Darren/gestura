import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { PaletteConfigSchema } from '@gestura/core'
import type { PaletteConfig } from '@gestura/core'

export class PaletteStore {
  constructor(private readonly directory: string) {}
  async load(fallback: PaletteConfig): Promise<PaletteConfig> {
    try {
      const path = join(this.directory, 'palette.json')
      if ((await stat(path)).size > 1024 * 1024) throw Error('Oversized palette')
      return PaletteConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch {
      return fallback
    }
  }
  async save(value: PaletteConfig): Promise<void> {
    const valid = PaletteConfigSchema.parse(value)
    await mkdir(this.directory, { recursive: true })
    const path = join(this.directory, 'palette.json')
    await writeFile(`${path}.tmp`, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }
}
