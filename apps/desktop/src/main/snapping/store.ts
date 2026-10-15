import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { SnapPreferencesSchema } from '@gestura/core'
import type { SnapPreferences } from '@gestura/core'
export class SnapStore {
  constructor(private readonly directory: string) {}
  async load(): Promise<SnapPreferences> {
    try {
      const path = join(this.directory, 'snap-preferences.json')
      if ((await stat(path)).size > 64 * 1024) throw Error('Oversized preferences')
      return SnapPreferencesSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch {
      return { version: 1, apps: {} }
    }
  }
  async save(preferences: SnapPreferences): Promise<void> {
    const valid = SnapPreferencesSchema.parse(preferences)
    await mkdir(this.directory, { recursive: true })
    const path = join(this.directory, 'snap-preferences.json')
    await writeFile(`${path}.tmp`, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }
}
