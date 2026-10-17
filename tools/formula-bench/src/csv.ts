import { parse } from 'csv-parse/sync'
import type { FormulaRequest } from '@gestura/genai'

export interface FormulaCase {
  id: string
  utterance: string
  expectedStatus: 'ok' | 'needs_clarification' | 'unsupported'
  expectedFormula: string
  context: FormulaRequest['context']
}

const REQUIRED_COLS = ['id', 'utterance', 'expected_status']

export function readCasesCsv(text: string): FormulaCase[] {
  if (text.length > 2_000_000) throw new Error('Formula CSV exceeds 2 MB')
  const records: unknown = parse(text, {
    bom: true,
    columns: (columns: string[]) => {
      const headers = columns.map((c) => c.trim().toLowerCase())
      const missing = REQUIRED_COLS.filter((h) => !headers.includes(h))
      if (missing.length) throw new Error(`CSV missing columns: ${missing.join(', ')}`)
      return headers
    },
    skip_empty_lines: true,
    max_record_size: 32768
  })
  if (!Array.isArray(records) || records.length > 10_000)
    throw new Error('Invalid formula CSV record count')
  const ids = new Set<string>()
  return records.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid CSV row')
    const row = candidate as Record<string, string>
    const status = row.expected_status?.trim()
    if (status !== 'ok' && status !== 'needs_clarification' && status !== 'unsupported')
      throw new Error(`${row.id}: expected_status must be ok, needs_clarification, or unsupported`)
    const id = row.id?.trim()
    if (!id) throw new Error(`Missing id in row: ${JSON.stringify(row)}`)
    if (ids.has(id)) throw new Error(`Duplicate case id: ${id}`)
    ids.add(id)
    return {
      id,
      utterance: row.utterance?.trim() ?? '',
      expectedStatus: status as FormulaCase['expectedStatus'],
      expectedFormula: row.expected_formula?.trim() ?? '',
      context: {
        sheetName: row.sheet_name?.trim() || 'Sheet1',
        selectionAddress: row.selection?.trim() || 'A1',
        activeCell: row.active_cell?.trim() || 'A1',
        headers: (row.headers ?? '')
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
        columnTypes: tryParseJson(row.column_types, {}),
        usedRangeAddress: row.used_range?.trim() || 'A1:Z100'
      }
    }
  })
}

function tryParseJson(
  raw: string | undefined,
  fallback: Record<string, string>
): Record<string, string> {
  if (!raw?.trim()) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : fallback
  } catch {
    return fallback
  }
}
