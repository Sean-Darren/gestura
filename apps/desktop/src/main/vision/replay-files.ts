import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFixture, SessionLabelsSchema } from '@gestura/replay'
import type { RecordedSession } from '@gestura/replay'
import type { FaceFrame } from '@gestura/core'

export async function saveRecording(directory: string, session: RecordedSession): Promise<void> {
  parseFixture(session.jsonl)
  SessionLabelsSchema.parse(session.labels)
  await mkdir(directory, { recursive: true })
  // Each explicitly requested session gets a new directory, so existing fixtures are never replaced.
  await writeFile(join(directory, 'frames.jsonl'), session.jsonl, { flag: 'wx' })
  await writeFile(join(directory, 'labels.json'), JSON.stringify(session.labels, null, 2) + '\n', {
    flag: 'wx'
  })
}
export async function loadRecording(path: string): Promise<FaceFrame[]> {
  if ((await stat(path)).size > 200_000_000) throw new Error('Fixture exceeds 200 MB')
  return parseFixture(await readFile(path, 'utf8'))
}
