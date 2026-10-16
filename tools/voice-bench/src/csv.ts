import { parse } from 'csv-parse/sync'
import { VoiceCaseSchema } from '@gestura/core'
import type { VoiceCase } from '@gestura/core'
export function readCasesCsv(text: string): VoiceCase[] {
  if (text.length > 2000000) throw new Error('Voice CSV exceeds 2 MB')
  const records: unknown = parse(text, {
    bom: true,
    columns: (columns: string[]) => {
      const headers = columns.map((c) => c.trim().toLowerCase().replaceAll('_', ' '))
      const required = ['id', 'utterance', 'expected intent', 'slots', 'lang']
      const allowed = [...required, 'audio', 'context', 'pending']
      if (
        new Set(headers).size !== headers.length ||
        required.some((h) => !headers.includes(h)) ||
        headers.some((h) => !allowed.includes(h))
      )
        throw new Error(
          'CSV needs id,utterance,expected intent,slots,lang; optional audio,context,pending'
        )
      return headers
    },
    skip_empty_lines: true,
    max_record_size: 32768
  })
  if (!Array.isArray(records) || records.length > 10000)
    throw new Error('Invalid voice CSV record count')
  const ids = new Set<string>()
  return records.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid CSV row')
    const row = candidate as Record<string, string>
    if (row.pending && row.pending !== 'true' && row.pending !== 'false')
      throw new Error('pending must be true or false')
    const item = VoiceCaseSchema.parse({
      id: row.id,
      utterance: row.utterance,
      expectedIntent: row['expected intent'],
      slots: JSON.parse(row.slots ?? '{}') as unknown,
      lang: row.lang,
      context: row.context || 'other',
      pending: row.pending === 'true',
      ...(row.audio ? { audio: row.audio } : {})
    })
    if (ids.has(item.id)) throw new Error(`Duplicate case id: ${item.id}`)
    ids.add(item.id)
    return item
  })
}
