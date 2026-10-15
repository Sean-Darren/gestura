import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readCasesCsv } from './csv'
import { evaluateCases, markdownReport } from './evaluate'
import { repoRoot } from './catalogue'

try {
  const { values } = parseArgs({
    options: {
      csv: { type: 'string' },
      mode: { type: 'string', default: 'text' },
      json: { type: 'boolean', default: false }
    },
    strict: true
  })
  if (values.mode !== 'text' && values.mode !== 'audio')
    throw new Error('--mode must be text or audio')
  // pnpm runs this CLI in tools/voice-bench; explicit paths are relative to the repository root.
  const file = resolve(repoRoot, values.csv ?? 'fixtures/transcripts/p3.2-commands.csv')
  const cases = readCasesCsv(await readFile(file, 'utf8'))
  const transcribe = values.mode === 'audio' ? (await import('./asr')).transcribeFixture : undefined
  const report = await evaluateCases(cases, {
    mode: values.mode,
    ...(transcribe ? { transcribe } : {})
  })
  process.stdout.write(
    `${values.json ? JSON.stringify(report, null, 2) : markdownReport(report)}\n`
  )
  if (!values.json)
    for (const row of report.rows.filter((row) => !row.skipped && !row.slotsCorrect))
      process.stdout.write(
        `${row.id}: expected ${row.expected}, got ${row.predicted ?? 'error'}${row.errorMessage ? ` (${row.errorMessage})` : ''}\n`
      )
  if (report.groups[0]?.errors || !report.groups[0]?.evaluated) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Voice benchmark failed'}\n`)
  process.exitCode = 1
}
