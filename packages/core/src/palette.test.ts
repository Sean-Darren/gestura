import { describe, expect, it } from 'vitest'
import {
  PaletteConfigSchema,
  PaletteControlSchema,
  EXCEL_FUNCTIONS,
  reviewTextPages,
  tileAt
} from './palette'
import { createIpcEnvelope } from './index'
describe('palette schemas and review', () => {
  it('has microphone-enabled default, bounded unique editable phrases and no arbitrary key or confirmation IPC', () => {
    expect(PaletteConfigSchema.parse({})).toEqual({ gazeOnly: false, dwellMs: 1000, phrases: [] })
    const phrase = { id: 'greeting', label: 'Greeting', text: '你好 =SUM(A1:A3)' }
    expect(PaletteConfigSchema.parse({ phrases: [phrase] }).phrases).toEqual([phrase])
    expect(PaletteConfigSchema.safeParse({ phrases: [phrase, phrase] }).success).toBe(false)
    expect(PaletteConfigSchema.safeParse({ phrases: [{ ...phrase, text: '\0' }] }).success).toBe(
      false
    )
    expect(
      PaletteControlSchema.safeParse({ operation: 'confirm', kind: 'voice-confirm' }).success
    ).toBe(false)
    expect(() =>
      createIpcEnvelope('palette:control', { operation: 'activate', id: 'palette' })
    ).not.toThrow()
    expect(EXCEL_FUNCTIONS).toHaveLength(10)
  })
  it('preserves every character over review pages including CJK, emoji and newlines', () => {
    const text = '你好😀\n'.repeat(100)
    for (const width of [320, 720, 1440]) {
      const pages = reviewTextPages(text, width)
      expect(pages.join('')).toBe(text)
      expect(pages.every((p) => p.split('\n').length <= 4)).toBe(true)
    }
    expect(
      tileAt(
        [{ id: 'a', label: 'A', disabled: false, bounds: { x: 0, y: 0, width: 64, height: 64 } }],
        { x: 64, y: 20 }
      )
    ).toBeUndefined()
  })
})

it('allows a single review line per page on short displays', async () => {
  const { reviewTextPages } = await import('./palette')
  const pages = reviewTextPages('甲'.repeat(60), 240, 1)
  expect(pages.join('')).toBe('甲'.repeat(60))
  expect(pages.every((page) => page.length <= 12)).toBe(true)
})
