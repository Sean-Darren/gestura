import { mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BenchSessionSchema } from '@gestura/core'
import type { BenchSession } from '@gestura/core'
import { markdown, summarize } from '@gestura/pointing-bench'
/** Only these owned files are written/deleted; callers cannot supply filesystem paths. */
export class BenchStore {
  private queue: Promise<void> = Promise.resolve()
  constructor(private readonly directory: string) {}
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work)
    this.queue = next.catch(() => {})
    return next
  }
  save(session: BenchSession): Promise<void> {
    return this.enqueue(async () => {
      const valid = BenchSessionSchema.parse(session)
      if (!valid.config.persist) return
      await mkdir(this.directory, { recursive: true })
      for (const [name, content] of [
        ['session.json', JSON.stringify(valid, null, 2)],
        [
          'summary.json',
          JSON.stringify(
            { version: 1, config: valid.config, status: valid.status, rows: summarize(valid) },
            null,
            2
          )
        ],
        ['summary.md', markdown(valid)]
      ]) {
        const target = join(this.directory, name!)
        await writeFile(`${target}.tmp`, content! + '\n', { mode: 0o600 })
        await rename(`${target}.tmp`, target)
      }
    })
  }
  clear(): Promise<void> {
    return this.enqueue(async () => {
      for (const name of ['session.json', 'summary.json', 'summary.md']) {
        await rm(join(this.directory, name), { force: true })
        await rm(join(this.directory, `${name}.tmp`), { force: true })
      }
    })
  }
}
