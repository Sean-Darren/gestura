import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readCasesCsv } from './csv'
import { evaluateCases, markdownReport } from './evaluate'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

try {
  const { values } = parseArgs({
    options: {
      csv: { type: 'string' },
      json: { type: 'boolean', default: false }
    },
    strict: true
  })
  const file = resolve(rootDir, values.csv ?? 'fixtures/formula-cases/p4.2-baseline.csv')
  const cases = readCasesCsv(await readFile(file, 'utf8'))
  const report = await evaluateCases(cases)
  process.stdout.write(
    `${values.json ? JSON.stringify(report, null, 2) : markdownReport(report)}\n`
  )
  if (!values.json)
    for (const row of report.rows.filter((r) => !r.skipped && !r.correct))
      process.stdout.write(
        `${row.id}: expected ${row.expected}, got ${row.actual ?? 'error'}${row.errorMessage ? ` (${row.errorMessage})` : ''}\n`
      )
  if (report.errors > 0) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Formula benchmark failed'}\n`)
  process.exitCode = 1
}
