import { IntentMatcher } from '@gestura/intent'
import type { MatchResult } from '@gestura/intent'
import type { VoiceCase } from '@gestura/core'

export type Evaluation = {
  id: string
  lang: VoiceCase['lang']
  expected: VoiceCase['expectedIntent']
  predicted: string | null
  intentCorrect: boolean
  slotsCorrect: boolean
  skipped: boolean
  error: boolean
  errorMessage?: string
}
export type GroupReport = {
  group: string
  cases: number
  evaluated: number
  skipped: number
  errors: number
  intentAccuracy: number | null
  exactAccuracy: number | null
}
export type VoiceReport = { mode: 'text' | 'audio'; groups: GroupReport[]; rows: Evaluation[] }
const slotKey = (value: Record<string, string>): string =>
  JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
export async function evaluateCases(
  cases: readonly VoiceCase[],
  options: {
    mode: 'text' | 'audio'
    matcher?: IntentMatcher
    transcribe?(audio: string): Promise<{ text: string; tSpeechStart: number }>
  }
): Promise<VoiceReport> {
  const matcher = options.matcher ?? new IntentMatcher()
  const rows: Evaluation[] = []
  for (const item of cases) {
    const row: Evaluation = {
      id: item.id,
      lang: item.lang,
      expected: item.expectedIntent,
      predicted: null,
      intentCorrect: false,
      slotsCorrect: false,
      skipped: false,
      error: false
    }
    if (options.mode === 'audio' && !item.audio) {
      row.skipped = true
      rows.push(row)
      continue
    }
    try {
      if (options.mode === 'audio' && !options.transcribe)
        throw new Error('Audio mode needs a local transcriber')
      // Text-only evaluation uses a synthetic onset for classification, never for a real ActionGate.
      const input =
        options.mode === 'audio'
          ? await options.transcribe!(item.audio!)
          : { text: item.utterance, tSpeechStart: 1000 }
      const result: MatchResult = matcher.match(
        input.text,
        { app: item.context, pendingProposal: item.pending },
        input.tSpeechStart
      )
      row.predicted = result.kind === 'suggestions' ? 'suggestions' : result.intent.id
      row.intentCorrect = row.predicted === item.expectedIntent
      const actualSlots = result.kind === 'suggestions' ? {} : result.intent.slots
      row.slotsCorrect = row.intentCorrect && slotKey(actualSlots) === slotKey(item.slots)
    } catch (error) {
      row.error = true
      row.errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Evaluation failed'
    }
    rows.push(row)
  }
  const groups = ['overall', 'en', 'yue', 'mixed'].map((group) => {
    const all = rows.filter((row) => group === 'overall' || row.lang === group)
    const evaluated = all.filter((row) => !row.skipped)
    return {
      group,
      cases: all.length,
      evaluated: evaluated.length,
      skipped: all.length - evaluated.length,
      errors: evaluated.filter((row) => row.error).length,
      intentAccuracy: evaluated.length
        ? evaluated.filter((row) => row.intentCorrect).length / evaluated.length
        : null,
      exactAccuracy: evaluated.length
        ? evaluated.filter((row) => row.slotsCorrect).length / evaluated.length
        : null
    }
  })
  return { mode: options.mode, rows, groups }
}
export function markdownReport(report: VoiceReport): string {
  const percent = (value: number | null): string =>
    value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`
  return [
    `Mode: ${report.mode}. Exact accuracy requires both intent and slots.`,
    '',
    '| Group | Evaluated / cases | Skipped | Errors | Intent accuracy | Intent + slots |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.groups.map(
      (g) =>
        `| ${g.group} | ${g.evaluated} / ${g.cases} | ${g.skipped} | ${g.errors} | ${percent(g.intentAccuracy)} | ${percent(g.exactAccuracy)} |`
    )
  ].join('\n')
}
