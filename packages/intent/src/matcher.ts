import {
  CommandCatalogueSchema,
  IntentContextSchema,
  IntentSchema,
  VoiceConfirmationEvidenceSchema
} from '@gestura/core'
import type { Intent, IntentContext } from '@gestura/core'
import { DEFAULT_INTENT_CONFIG, IntentConfigSchema } from '@gestura/core/config'
import type { IntentConfig } from '@gestura/core/config'
import catalogue from './commands.generated.json'
import { normalizeRange, normalizeUtterance } from './normalize'
import type { MatchResult, Suggestion } from './types'

type Pattern = {
  id: Intent['id']
  phrase: string
  normalized: string
  exactOnly: boolean
  pendingOnly: boolean
}
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!
      previous[j] = Math.min(
        above + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length)
}
function splitTemplate(phrase: string, slot: string): [string, string] {
  const [prefix = '', suffix = ''] = phrase.split(`{${slot}}`)
  return [normalizeUtterance(prefix), normalizeUtterance(suffix)]
}
function extractSlot(text: string, prefix: string, suffix: string): string | undefined {
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return undefined
  const end = suffix ? text.length - suffix.length : text.length
  return text.slice(prefix.length, end).trim() || undefined
}
function rawRequest(text: string, prefix: string): string | undefined {
  for (let i = 1; i <= Math.min(text.length, 256); i++) {
    if (normalizeUtterance(text.slice(0, i)) !== prefix) continue
    if (/[a-z]$/i.test(text.slice(0, i)) && /^[a-z]/i.test(text.slice(i))) continue
    const request = text
      .slice(i)
      .replace(/^[\s:：]+/u, '')
      .trim()
    if (request) return request
  }
  return undefined
}
export class IntentMatcher {
  private readonly patterns: Pattern[]
  private readonly config: IntentConfig
  constructor(options: Partial<IntentConfig> = {}, data: unknown = catalogue) {
    this.config = IntentConfigSchema.parse({ ...DEFAULT_INTENT_CONFIG, ...options })
    this.patterns = CommandCatalogueSchema.parse(data).commands.flatMap((command) =>
      Object.values(command.phrasings).flatMap((phrases) =>
        phrases.map((phrase) => ({
          id: command.id,
          phrase,
          normalized: normalizeUtterance(phrase),
          exactOnly: command.exactOnly,
          pendingOnly: command.pendingOnly
        }))
      )
    )
  }
  match(text: string, context: Partial<IntentContext> = {}, tSpeechStart?: number): MatchResult {
    const ctx = IntentContextSchema.parse(context)
    if (typeof text !== 'string' || !text.trim() || text.length > this.config.maxInputLength)
      return { kind: 'suggestions', suggestions: [], reason: 'invalid-input' }
    const input = normalizeUtterance(text)
    if (!input) return { kind: 'suggestions', suggestions: [], reason: 'invalid-input' }
    const exact: { intent: Intent; pattern: Pattern }[] = []
    for (const pattern of this.patterns) {
      let intent: Intent | undefined
      if (pattern.id === 'go-to') {
        const [prefix, suffix] = splitTemplate(pattern.phrase, 'range')
        const slot = extractSlot(input, prefix, suffix)
        const range = slot ? normalizeRange(slot) : undefined
        if (range) intent = { id: 'go-to', slots: { range } }
      } else if (pattern.id === 'formula-request' || pattern.id === 'reply-request') {
        const [prefix] = splitTemplate(pattern.phrase, 'request')
        const request = input.startsWith(prefix) ? rawRequest(text, prefix) : undefined
        if (request) intent = { id: pattern.id, slots: { request } }
      } else if (input === pattern.normalized) intent = { id: pattern.id, slots: {} }
      if (intent) exact.push({ intent, pattern })
    }
    const distinct = new Map(exact.map((x) => [JSON.stringify(x.intent), x]))
    if (distinct.size === 1) {
      const { intent, pattern } = [...distinct.values()][0]!
      if (pattern.pendingOnly && !ctx.pendingProposal)
        return { kind: 'suggestions', suggestions: [], reason: 'pending-required' }
      if (intent.id === 'confirm') {
        const evidence = VoiceConfirmationEvidenceSchema.safeParse({
          kind: 'voice-confirm',
          tSpeechStart
        })
        if (!evidence.success)
          return { kind: 'suggestions', suggestions: [], reason: 'voice-timing-required' }
        return { kind: 'match', intent, method: 'template', confidence: 1, evidence: evidence.data }
      }
      return {
        kind: 'match',
        intent: IntentSchema.parse(intent),
        method: 'template',
        confidence: 1
      }
    }
    if (distinct.size > 1)
      return {
        kind: 'suggestions',
        reason: 'ambiguous',
        suggestions: [...distinct.values()]
          .filter((x) => !x.pattern.exactOnly)
          .slice(0, 3)
          .map((x) => ({ intent: x.intent, confidence: 1, phrasing: x.pattern.phrase }))
      }
    const candidates = new Map<string, Suggestion>()
    for (const pattern of this.patterns) {
      if (pattern.exactOnly) continue
      // Fuzzy matching changes command words only. Cell references and free text never get guessed.
      if (
        pattern.id === 'go-to' ||
        pattern.id === 'formula-request' ||
        pattern.id === 'reply-request'
      ) {
        if (pattern.id === 'formula-request' || pattern.id === 'reply-request') continue
        const [prefix, suffix] = splitTemplate(pattern.phrase, 'range')
        const cells =
          /(?<![a-z0-9])([a-z]{1,3}\s*[1-9]\d*(?:\s*(?::|到|至|to)\s*[a-z]{1,3}\s*[1-9]\d*)?)(?![a-z0-9])/g
        for (const match of input.matchAll(cells)) {
          const range = normalizeRange(match[0])
          if (!range) continue
          const before = input.slice(0, match.index).trim()
          const after = input.slice(match.index! + match[0].length).trim()
          if (after !== suffix) continue
          // Slot length must not boost an unrelated command's confidence.
          const candidate: Suggestion = {
            intent: { id: 'go-to', slots: { range } },
            confidence: similarity(before, prefix),
            phrasing: pattern.phrase.replace('{range}', range)
          }
          const key = JSON.stringify(candidate.intent)
          if (candidate.confidence > (candidates.get(key)?.confidence ?? -1))
            candidates.set(key, candidate)
        }
        continue
      }
      const candidate: Suggestion = {
        intent: { id: pattern.id, slots: {} },
        confidence: similarity(input, pattern.normalized),
        phrasing: pattern.phrase
      }
      const key = JSON.stringify(candidate.intent)
      if (candidate.confidence > (candidates.get(key)?.confidence ?? -1))
        candidates.set(key, candidate)
    }
    const sorted = [...candidates.values()].sort(
      (a, b) =>
        b.confidence - a.confidence ||
        compare(a.intent.id, b.intent.id) ||
        compare(a.phrasing, b.phrasing)
    )
    const first = sorted[0]
    const ambiguous =
      first && first.confidence - (sorted[1]?.confidence ?? 0) < this.config.ambiguityMargin
    if (first && first.confidence >= this.config.fuzzyThreshold && !ambiguous)
      return { kind: 'match', intent: first.intent, confidence: first.confidence, method: 'fuzzy' }
    if (ctx.app === 'excel')
      return {
        kind: 'genai-request',
        intent: { id: 'formula-request', slots: { request: text } },
        confidence: first?.confidence ?? 0
      }
    return {
      kind: 'suggestions',
      suggestions: sorted.slice(0, 3),
      reason: ambiguous ? 'ambiguous' : 'below-threshold'
    }
  }
}
