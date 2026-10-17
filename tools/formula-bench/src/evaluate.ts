import { FormulaBenchConfigSchema } from '@gestura/core'
import type { FormulaBenchCase, FormulaBenchConfig } from '@gestura/core'
import { FormulaResponseSchema } from '@gestura/genai'
import type { FormulaRequest, FormulaResponse } from '@gestura/genai'
import { fixtureContext } from './cases'
import { equalValues, evaluateFormula } from './evaluator'
import type { CellValue } from './evaluator'
export type ProviderCall = {
  provider: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  failed: boolean
}
export type Generation = { response: FormulaResponse; calls: ProviderCall[] }
export type Generator = (request: FormulaRequest, signal: AbortSignal) => Promise<Generation>
export type Attempt = {
  utterance: string
  formula: string | null
  status: string
  value: CellValue
  correct: boolean
  error: string | null
  latencyMs: number | null
  asrMs: number | null
  stage: 'asr' | 'generation' | 'evaluation'
  totalMs: number
  estimatedCostUsd: number | null
  calls: ProviderCall[]
}
export type CaseRow = {
  id: string
  lang: FormulaBenchCase['lang']
  category: FormulaBenchCase['category']
  first: Attempt
  correction: Attempt | null
  firstCorrect: boolean
  afterCorrectionCorrect: boolean
}
export type Group = {
  group: string
  count: number
  firstCorrect: number
  afterCorrectionCorrect: number
  firstAccuracy: number | null
  afterCorrectionAccuracy: number | null
  firstLatency: Quantiles
  correctionLatency: Quantiles
  endToEndLatency: Quantiles
  estimatedCostPerRequestUsd: number | null
}
type Quantiles = { count: number; p50: number | null; p95: number | null }
export type FormulaReport = {
  mode: 'text' | 'audio'
  provider: 'mock' | 'live'
  evaluator: string
  config: FormulaBenchConfig
  rows: CaseRow[]
  groups: Group[]
  totals: {
    cases: number
    requests: number
    providerCalls: number | null
    estimatedCostUsd: number | null
  }
  notes: string[]
}
export function quantiles(values: number[]): Quantiles {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number): number | null =>
    sorted.length ? sorted[Math.ceil(sorted.length * p) - 1]! : null
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95) }
}
export function estimatedCost(
  calls: ProviderCall[],
  config: FormulaBenchConfig,
  mock: boolean
): number | null {
  if (mock) return 0
  if (!calls.length) return null
  let total = 0
  for (const call of calls) {
    const rate =
      call.provider === 'cloud'
        ? config.pricing?.cloud
        : call.provider === 'local'
          ? config.pricing?.local
          : undefined
    if (
      !rate ||
      rate.model !== call.model ||
      call.inputTokens === undefined ||
      call.outputTokens === undefined ||
      call.failed ||
      !Number.isSafeInteger(call.inputTokens) ||
      !Number.isSafeInteger(call.outputTokens) ||
      call.inputTokens < 0 ||
      call.outputTokens < 0
    )
      return null
    total +=
      (call.inputTokens * rate.inputPerMillion + call.outputTokens * rate.outputPerMillion) / 1e6
  }
  return Number.isFinite(total) ? total : null
}
export async function evaluateCases(
  cases: FormulaBenchCase[],
  options: {
    generate: Generator
    provider: 'mock' | 'live'
    mode?: 'text' | 'audio'
    config?: FormulaBenchConfig
    now?(): number
    signal?: AbortSignal
    transcribe?(
      file: string,
      signal?: AbortSignal
    ): Promise<{ text: string; tSpeechStart: number; latencyMs?: number }>
  }
): Promise<FormulaReport> {
  const config = FormulaBenchConfigSchema.parse(options.config ?? {}),
    now = options.now ?? (() => performance.now()),
    mode = options.mode ?? 'text'
  const rows: CaseRow[] = []
  const expectedValues = cases.map((c) =>
    'value' in c.expected
      ? [c.expected.value]
      : c.expected.acceptedFormulas.map((f) => evaluateFormula(c, f))
  )
  for (const [index, c] of cases.entries()) {
    options.signal?.throwIfAborted()
    // Expected answers never cross the generator boundary.
    const expected = expectedValues[index]!
    const attempt = async (
      utterance: string,
      audio: string | undefined,
      history: FormulaRequest['history']
    ): Promise<Attempt> => {
      const start = now(),
        abort = new AbortController()
      const cancel = (): void => abort.abort()
      options.signal?.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(() => abort.abort(), config.timeoutMs)
      let asrMs: number | null = null,
        generationStart: number | undefined,
        latencyMs: number | null = null,
        stage: Attempt['stage'] = mode === 'audio' ? 'asr' : 'generation',
        formula: string | null = null,
        calls: ProviderCall[] = []
      const bounded = async <T>(job: Promise<T>): Promise<T> => {
        let rejectAbort: (() => void) | undefined
        try {
          return await Promise.race([
            job,
            new Promise<never>((_resolve, reject) => {
              rejectAbort = () => reject(Error('Request cancelled or timed out'))
              abort.signal.addEventListener('abort', rejectAbort, { once: true })
              if (abort.signal.aborted) rejectAbort()
            })
          ])
        } finally {
          if (rejectAbort) abort.signal.removeEventListener('abort', rejectAbort)
        }
      }
      try {
        if (mode === 'audio') {
          if (!audio || !options.transcribe) throw Error('Audio fixture or ASR unavailable')
          const text = await bounded(options.transcribe(audio, abort.signal))
          utterance = text.text
          asrMs = now() - start
        }
        stage = 'generation'
        generationStart = now()
        const result = await bounded(
          options.generate(
            { utterance, lang: c.lang, context: fixtureContext(c, config.shareSamples), history },
            abort.signal
          )
        )
        latencyMs = now() - generationStart
        calls = result.calls
        const response = FormulaResponseSchema.parse(result.response)
        if (response.status !== 'ok') throw Error(response.status)
        formula = response.formula
        if (response.targetCell !== c.sheet.targetCell) throw Error('Wrong destination cell')
        stage = 'evaluation'
        const value = evaluateFormula(c, formula)
        return {
          utterance,
          formula,
          value,
          status: 'ok',
          correct: expected.some((v) =>
            equalValues(value, v, config.absoluteTolerance, config.relativeTolerance)
          ),
          error: null,
          latencyMs,
          stage,
          asrMs,
          totalMs: now() - start,
          estimatedCostUsd:
            generationStart === undefined
              ? 0
              : estimatedCost(calls, config, options.provider === 'mock'),
          calls
        }
      } catch (error) {
        return {
          utterance,
          formula,
          value: null,
          status: 'error',
          correct: false,
          error:
            error instanceof Error &&
            [
              'Audio fixture or ASR unavailable',
              'Wrong destination cell',
              'needs_clarification',
              'unsupported',
              'Request cancelled or timed out'
            ].includes(error.message)
              ? error.message
              : 'Generation, ASR or evaluator failed (see stage/status; raw provider errors are not logged)',
          latencyMs: latencyMs ?? (generationStart === undefined ? null : now() - generationStart),
          stage,
          asrMs,
          totalMs: now() - start,
          estimatedCostUsd:
            generationStart === undefined
              ? 0
              : estimatedCost(calls, config, options.provider === 'mock'),
          calls
        }
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', cancel)
      }
    }
    const first = await attempt(c.utterance, c.audioFile, [])
    options.signal?.throwIfAborted()
    const correction =
      !first.correct && c.correctionUtterance
        ? await attempt(c.correctionUtterance, c.correctionAudioFile, [
            { role: 'user', content: first.utterance },
            { role: 'assistant', content: first.formula ?? first.status }
          ])
        : null
    rows.push({
      id: c.id,
      lang: c.lang,
      category: c.category,
      first,
      correction,
      firstCorrect: first.correct,
      afterCorrectionCorrect: first.correct || !!correction?.correct
    })
  }
  const attempts = rows.flatMap((r) => [r.first, ...(r.correction ? [r.correction] : [])])
  const group = (name: string, selected: CaseRow[]): Group => {
    const firstCorrect = selected.filter((r) => r.firstCorrect).length,
      afterCorrectionCorrect = selected.filter((r) => r.afterCorrectionCorrect).length
    const requests = selected
      .flatMap((r) => [r.first, ...(r.correction ? [r.correction] : [])])
      .filter((a) => a.latencyMs !== null)
    return {
      group: name,
      count: selected.length,
      firstCorrect,
      afterCorrectionCorrect,
      firstAccuracy: selected.length ? firstCorrect / selected.length : null,
      afterCorrectionAccuracy: selected.length ? afterCorrectionCorrect / selected.length : null,
      firstLatency: quantiles(
        selected.flatMap((r) => (r.first.latencyMs === null ? [] : [r.first.latencyMs]))
      ),
      correctionLatency: quantiles(
        selected.flatMap((r) =>
          r.correction?.latencyMs !== null && r.correction ? [r.correction.latencyMs] : []
        )
      ),
      endToEndLatency: quantiles(
        selected.map((r) => r.first.totalMs + (r.correction?.totalMs ?? 0))
      ),
      estimatedCostPerRequestUsd:
        requests.length && requests.every((r) => r.estimatedCostUsd !== null)
          ? requests.reduce((s, r) => s + r.estimatedCostUsd!, 0) / requests.length
          : null
    }
  }
  return {
    mode,
    provider: options.provider,
    evaluator: 'HyperFormula 3.5.0 (GPLv3)',
    config,
    rows,
    groups: [
      group('overall', rows),
      ...(['en', 'yue', 'mixed'] as const).map((lang) =>
        group(
          `lang:${lang}`,
          rows.filter((r) => r.lang === lang)
        )
      ),
      ...(['aggregation', 'lookup', 'logical', 'date', 'text', 'uncategorized'] as const).map(
        (category) =>
          group(
            `category:${category}`,
            rows.filter((r) => r.category === category)
          )
      )
    ],
    totals: {
      cases: rows.length,
      requests: attempts.filter((a) => a.latencyMs !== null).length,
      providerCalls:
        options.provider === 'live' && attempts.some((a) => a.latencyMs !== null && !a.calls.length)
          ? null
          : attempts.reduce((s, r) => s + r.calls.length, 0),
      estimatedCostUsd: attempts.every((r) => r.estimatedCostUsd !== null)
        ? attempts.reduce((s, r) => s + r.estimatedCostUsd!, 0)
        : null
    },
    notes: [
      'Mock results test the harness, not LLM quality.',
      'After-one-correction is cumulative over every case; failures and missing audio stay in the denominator.',
      'First/correction latency measures generation through structured response, including internal retries and failed requests; evaluation time is excluded. Attempts that never reach generation have no generation latency. End-to-end includes evaluation and audio playback/ASR, summed across attempts.',
      'Cost is an estimate from configured model rates and reported tokens, including retries; missing usage/pricing or failed billed calls makes cost unknown.',
      'HyperFormula results are not proof of Excel compatibility.'
    ]
  }
}
export function markdownReport(report: FormulaReport): string {
  const n = (v: number | null): string => (v === null ? 'N/A' : v.toFixed(2)),
    p = (v: number | null): string => (v === null ? 'N/A' : `${(v * 100).toFixed(1)}%`)
  return [
    `# Formula benchmark (${report.provider}, ${report.mode})`,
    '',
    `Evaluator: ${report.evaluator}`,
    `Models: ${[...new Set(report.rows.flatMap((r) => [r.first, ...(r.correction ? [r.correction] : [])]).flatMap((a) => a.calls.map((c) => c.model ?? c.provider)))].map((s) => s.replaceAll(/[|\r\n]/g, ' ')).join(', ') || 'no provider calls'}`,
    '',
    '| Group | Cases | First try | After correction | First p50/p95 ms | Correction p50/p95 ms | End-to-end p50/p95 ms | USD/request |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.groups.map(
      (g) =>
        `| ${g.group} | ${g.count} | ${p(g.firstAccuracy)} | ${p(g.afterCorrectionAccuracy)} | ${n(g.firstLatency.p50)}/${n(g.firstLatency.p95)} | ${n(g.correctionLatency.p50)}/${n(g.correctionLatency.p95)} | ${n(g.endToEndLatency.p50)}/${n(g.endToEndLatency.p95)} | ${g.estimatedCostPerRequestUsd === null ? 'N/A' : g.estimatedCostPerRequestUsd.toFixed(6)} |`
    ),
    '',
    ...report.notes.map((s) => `- ${s}`),
    ''
  ].join('\n')
}
