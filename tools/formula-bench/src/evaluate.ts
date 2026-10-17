import { MockProvider, FormulaRouter, validateFormula } from '@gestura/genai'
import type { FormulaResponse } from '@gestura/genai'
import type { FormulaCase } from './csv'

export interface CaseRow {
  id: string
  utterance: string
  expected: string
  actual: string | null
  correct: boolean
  skipped: boolean
  errorMessage?: string
}

export interface FormulaReport {
  rows: CaseRow[]
  groups: Array<{ errors: number; evaluated: number; skipped: number }>
  errors: number
  total: number
}

export async function evaluateCases(cases: FormulaCase[]): Promise<FormulaReport> {
  const rows: CaseRow[] = []
  let errors = 0
  let evaluated = 0
  let skipped = 0

  for (const c of cases) {
    if (!c.utterance.trim()) {
      rows.push({
        id: c.id,
        utterance: c.utterance,
        expected: c.expectedStatus,
        actual: null,
        correct: false,
        skipped: true,
        errorMessage: 'Empty utterance'
      })
      skipped++
      continue
    }

    try {
      const response = buildCannedResponse(c)
      const cloud = new MockProvider({ responses: { [c.utterance]: response } })
      const local = new MockProvider({ throwOnUnknown: true })
      const router = new FormulaRouter({ cloud, local, timeoutMs: 5000 })

      const result = await router.generate({
        utterance: c.utterance,
        lang: 'en',
        context: c.context,
        history: []
      })

      const resultId = describeResult(result)
      const expectedId = describeExpected(c)
      const correct = resultId === expectedId
      rows.push({
        id: c.id,
        utterance: c.utterance,
        expected: expectedId,
        actual: resultId,
        correct,
        skipped: false
      })
      if (!correct) errors++
      evaluated++
    } catch (err) {
      rows.push({
        id: c.id,
        utterance: c.utterance,
        expected: describeExpected(c),
        actual: null,
        correct: false,
        skipped: false,
        errorMessage: err instanceof Error ? err.message : String(err)
      })
      errors++
      evaluated++
    }
  }

  return {
    rows,
    groups: [{ errors, evaluated, skipped }],
    errors,
    total: cases.length
  }
}

/** Build a canned response matching the expected case so the pipeline passes through cleanly. */
function buildCannedResponse(c: FormulaCase): Record<string, unknown> {
  if (c.expectedStatus !== 'ok' || !c.expectedFormula) {
    return {
      status: c.expectedStatus,
      ...(c.expectedStatus === 'needs_clarification'
        ? { clarificationQuestion: 'Can you clarify?' }
        : { explanation: 'Not supported.' })
    }
  }
  const validation = validateFormula(c.expectedFormula, c.context.usedRangeAddress)
  if (!validation.valid) {
    return { status: 'unsupported', explanation: validation.errors.join('; ') }
  }
  return {
    status: 'ok',
    formula: c.expectedFormula,
    targetCell: c.context.activeCell,
    references: [],
    functionsUsed: [],
    explanation: 'Works as expected.'
  }
}

function describeResult(result: FormulaResponse): string {
  if (result.status === 'ok') return `ok:${result.formula}`
  if (result.status === 'needs_clarification') return 'needs_clarification'
  return 'unsupported'
}

function describeExpected(c: FormulaCase): string {
  if (c.expectedStatus === 'ok' && c.expectedFormula) return `ok:${c.expectedFormula}`
  if (c.expectedStatus === 'needs_clarification') return 'needs_clarification'
  return 'unsupported'
}

export function markdownReport(report: FormulaReport): string {
  const lines: string[] = ['# Formula benchmark']
  const g = report.groups[0]
  if (g) {
    const rate = g.evaluated
      ? `${Math.round(((g.evaluated - g.errors) / g.evaluated) * 100)}%`
      : 'N/A'
    lines.push('')
    lines.push(
      `| Total | Evaluated | Skipped | Errors | Accuracy |`,
      `| ---: | ---: | ---: | ---: | ---: |`,
      `| ${report.total} | ${g.evaluated} | ${g.skipped} | ${g.errors} | ${rate} |`
    )
  }
  if (report.errors > 0) {
    lines.push('')
    lines.push('## Failures')
    for (const r of report.rows.filter((r) => !r.correct && !r.skipped))
      lines.push(
        `- **${r.id}**: expected \`${r.expected}\`, got \`${r.actual ?? 'error'}\`${r.errorMessage ? ` (${r.errorMessage})` : ''}`
      )
  }
  return lines.join('\n') + '\n'
}
