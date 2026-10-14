import { readFile, writeFile, mkdir, rename, appendFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CalibrationProfileSchema } from '@gestura/core'
import type { CalibrationProfile } from '@gestura/core'
export class CalibrationStore {
  constructor(private readonly directory: string) {}
  async load(): Promise<CalibrationProfile | undefined> {
    try {
      const path = join(this.directory, 'calibration-profile.json')
      if ((await stat(path)).size > 128 * 1024) return undefined
      return CalibrationProfileSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch {
      return undefined
    }
  }
  async save(profile: CalibrationProfile): Promise<void> {
    const valid = CalibrationProfileSchema.parse(profile)
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, `calibration-profile.${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(valid, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, join(this.directory, 'calibration-profile.json'))
  }
  async logDuration(profile: CalibrationProfile): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await appendFile(
      join(this.directory, 'calibration-durations.jsonl'),
      JSON.stringify({ createdAt: profile.createdAt, durationMs: profile.durationMs }) + '\n',
      { mode: 0o600 }
    )
  }
  async clearLog(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await writeFile(join(this.directory, 'calibration-durations.jsonl'), '', { mode: 0o600 })
  }
}
