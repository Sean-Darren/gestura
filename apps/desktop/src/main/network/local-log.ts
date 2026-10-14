import { appendFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BlockedRequest } from './index'

export type BlockedRequestLogger = {
  log(request: BlockedRequest): Promise<void>
  clear(): Promise<void>
  path: string
}

export function createBlockedRequestLogger(
  enabled: boolean,
  logDirectory: string
): BlockedRequestLogger {
  const logPath = join(logDirectory, 'blocked-requests.jsonl')

  return {
    async log(request: BlockedRequest): Promise<void> {
      if (!enabled) return
      const line = `${JSON.stringify({ ...request, at: new Date().toISOString() })}\n`
      try {
        await mkdir(logDirectory, { recursive: true })
        await appendFile(logPath, line, { encoding: 'utf8', mode: 0o600 })
      } catch {
        // A local policy log must never interfere with request blocking.
      }
    },
    async clear(): Promise<void> {
      await rm(logPath, { force: true })
    },
    path: logPath
  }
}
