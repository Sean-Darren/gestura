import type { ExcelContext } from '@gestura/core'
import { z } from 'zod'

// ── Provider interface (Q14: provider-agnostic) ──────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateRequest {
  messages: Message[]
  jsonSchema: object
  signal?: AbortSignal
}

export interface GenerateResponse {
  json: unknown
  provider: string
  durationMs: number
  model?: string
  usage?: { inputTokens: number; outputTokens: number }
}

export function tokenUsage(input: unknown, output: unknown): GenerateResponse['usage'] {
  return typeof input === 'number' &&
    typeof output === 'number' &&
    Number.isSafeInteger(input) &&
    Number.isSafeInteger(output) &&
    input >= 0 &&
    output >= 0
    ? { inputTokens: input, outputTokens: output }
    : undefined
}

export interface Provider {
  readonly id: string
  generate(request: GenerateRequest): Promise<GenerateResponse>
}

// ── Formula request (Q15: headers + addresses + types only; samples behind toggle) ──

export const FormulaRequestSchema = z.object({
  utterance: z.string().min(1).max(2000),
  lang: z.enum(['en', 'yue', 'mixed']).default('en'),
  context: z.object({
    sheetName: z.string(),
    selectionAddress: z.string(),
    activeCell: z.string(),
    headers: z.array(z.string()),
    columnTypes: z.record(z.string(), z.string()),
    usedRangeAddress: z.string(),
    samples: z
      .array(
        z.object({
          column: z.string(),
          values: z.array(z.string().max(1000)).min(1).max(5)
        })
      )
      .optional()
  }),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })
    )
    .max(50)
    .default([])
})
export type FormulaRequest = z.infer<typeof FormulaRequestSchema>

// ── Formula response ──────────────────────────────────────────────────────

export const CellRefSchema = z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/)

export const FormulaResponseOkSchema = z.object({
  status: z.literal('ok'),
  formula: z.string().min(1).max(16000),
  targetCell: CellRefSchema,
  references: z.array(CellRefSchema),
  functionsUsed: z.array(z.string()),
  explanation: z.string().max(500)
})

export const FormulaResponseClarifySchema = z.object({
  status: z.literal('needs_clarification'),
  clarificationQuestion: z.string().max(500)
})

export const FormulaResponseUnsupportedSchema = z.object({
  status: z.literal('unsupported'),
  explanation: z.string().max(500)
})

export const FormulaResponseSchema = z.discriminatedUnion('status', [
  FormulaResponseOkSchema,
  FormulaResponseClarifySchema,
  FormulaResponseUnsupportedSchema
])
export type FormulaResponse = z.infer<typeof FormulaResponseSchema>

// ── Context builder (Q15: no cell values leave without toggle) ─────────────

export function buildFormulaContext(
  excelContext: ExcelContext,
  shareSamples: boolean
): FormulaRequest['context'] {
  const ctx: FormulaRequest['context'] = {
    sheetName: excelContext.sheetName,
    selectionAddress: excelContext.selectionAddress,
    activeCell: excelContext.activeCell,
    headers: excelContext.headers,
    columnTypes: excelContext.columnTypes as Record<string, string>,
    usedRangeAddress: excelContext.usedRangeAddress
  }
  if (shareSamples && excelContext.samples && excelContext.samples.length > 0) {
    ctx.samples = excelContext.samples.map((s) => ({
      column: s.column,
      values: s.values
    }))
  }
  return ctx
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Functions that must never appear in a generated formula. */
const UNSAFE_FUNCTIONS = new Set([
  'WEBSERVICE',
  'RTD',
  'CALL',
  'REGISTER.ID',
  'SQL.REQUEST',
  'DDEINITIATE',
  'QUERYTABLE'
])

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a generated formula before it reaches ActionGate.
 * Checks: syntax parses, references inside usedRange, no unsafe functions.
 */
export function validateFormula(formula: string, usedRangeAddress: string): ValidationResult {
  const errors: string[] = []

  // 1. Syntax: basic tokenization check — must start with '='
  const trimmed = formula.trim()
  if (!trimmed.startsWith('=')) {
    errors.push('Formula must start with =')
  }

  // 2. Unsafe function blocklist
  const upperFormula = trimmed.toUpperCase()
  for (const unsafe of UNSAFE_FUNCTIONS) {
    if (upperFormula.includes(unsafe + '(')) {
      errors.push(`Unsafe function ${unsafe} is blocked`)
    }
  }

  // 3. Reference bounds check
  if (trimmed.startsWith('=')) {
    const refs = extractCellRefs(trimmed)
    const bounds = parseUsedRangeBounds(usedRangeAddress)
    if (bounds) {
      for (const ref of refs) {
        const refBounds = parseCellRef(ref)
        if (
          refBounds &&
          (refBounds.col < bounds.minCol ||
            refBounds.col > bounds.maxCol ||
            refBounds.row < bounds.minRow ||
            refBounds.row > bounds.maxRow)
        ) {
          errors.push(`Reference ${ref} is outside used range ${usedRangeAddress}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

function extractCellRefs(formula: string): string[] {
  const refs: string[] = []
  const regex = /\b([A-Z]{1,3})([1-9]\d{0,6})\b/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    // Skip function names: if a capital word is immediately followed by (, it's a function
    const col = match[1]!
    const row = match[2]!
    const full = `${col}${row}`
    // Check previous char — if it's a letter, this might be part of a longer name
    const before = formula[match.index - 1]
    // Check next char — if it's '(', this is a function call
    const after = formula[match.index + full.length]
    // ":range" context — check for range operator
    if (after === '(') continue
    // Don't include if preceded by a letter (part of function name like VLOOKUP)
    if (before && /[A-Z]/i.test(before)) continue
    refs.push(full)
  }
  return refs
}

interface CellBounds {
  col: number
  row: number
}

interface RangeBounds {
  minCol: number
  maxCol: number
  minRow: number
  maxRow: number
}

function colToNumber(col: string): number {
  let result = 0
  for (const ch of col) {
    result = result * 26 + (ch.charCodeAt(0) - 64)
  }
  return result
}

function parseCellRef(ref: string): CellBounds | null {
  const match = ref.match(/^([A-Z]{1,3})([1-9]\d{0,6})$/)
  if (!match) return null
  return { col: colToNumber(match[1]!), row: parseInt(match[2]!, 10) }
}

function parseUsedRangeBounds(address: string): RangeBounds | null {
  const rangeParts = address.split(':')
  if (rangeParts.length === 2) {
    const start = parseCellRef(rangeParts[0]!)
    const end = parseCellRef(rangeParts[1]!)
    if (start && end) {
      return {
        minCol: Math.min(start.col, end.col),
        maxCol: Math.max(start.col, end.col),
        minRow: Math.min(start.row, end.row),
        maxRow: Math.max(start.row, end.row)
      }
    }
  }
  // Single cell acts as its own bound
  const single = parseCellRef(address)
  if (single) {
    return {
      minCol: single.col,
      maxCol: single.col,
      minRow: single.row,
      maxRow: single.row
    }
  }
  return null
}

/** Heuristic: count distinct function names to determine single vs multi-function. */
export function isSingleFunction(formula: string): boolean {
  const trimmed = formula.trim()
  if (!trimmed.startsWith('=')) return false
  const funcs = new Set<string>()
  const regex = /\b([A-Z]{2,})\s*\(/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(trimmed)) !== null) {
    funcs.add(match[1]!)
  }
  return funcs.size <= 1
}

// ── Re-exports for convenience ──────────────────────────────────────────────

export { CloudProvider } from './providers/cloud'
export { LocalProvider } from './providers/local'
export { MockProvider } from './providers/mock'
export { FormulaRouter } from './formula/router'
