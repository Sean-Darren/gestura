import { z } from 'zod'
import { IntentIdSchema } from './intent'
import { FormulaLoopStateSchema } from './formula-loop'

export const DraftTextSchema = z
  .string()
  .max(10000)
  .refine((v) => !v.includes('\0'))
export const PhraseSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    label: z.string().trim().min(1).max(64),
    text: DraftTextSchema.refine((v) => !!v.trim())
  })
  .strict()
export const PaletteConfigSchema = z
  .object({
    gazeOnly: z.boolean().default(false),
    dwellMs: z.number().int().min(500).max(3000).default(1000),
    phrases: z.array(PhraseSchema).max(50).default([])
  })
  .strict()
  .refine(
    (v) => new Set(v.phrases.map((p) => p.id)).size === v.phrases.length,
    'Phrase IDs must be unique'
  )
export type PaletteConfig = z.infer<typeof PaletteConfigSchema>
export const DEFAULT_PALETTE_CONFIG = PaletteConfigSchema.parse({})
export const LISTENING_HOTKEY = 'Control+Alt+L'

// Microsoft Support's ten featured functions, checked 2026-10-16. These are starters, not a usage ranking.
export const EXCEL_FUNCTIONS = [
  'SUM',
  'IF',
  'SUMIFS',
  'XLOOKUP',
  'COUNTIFS',
  'COUNT',
  'LET',
  'FILTER',
  'UNIQUE',
  'TEXTBEFORE'
] as const
export const PALETTE_KEYS = [
  'enter',
  'tab',
  'backspace',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown'
] as const
export const COMPOSER_CHARACTERS = Array.from(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 =():$,+-*/.?!\'"_@#%&;<>[]{}\\\n'
)
export const COMPOSE_PURPOSES = ['text', 'phrase', 'range', 'formula'] as const
export const PaletteControlSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('activate'), id: z.string().min(1).max(100) }).strict(),
  z.object({ operation: z.literal('settings'), settings: PaletteConfigSchema }).strict(),
  z.object({ operation: z.literal('draft'), text: DraftTextSchema }).strict(),
  z.object({ operation: z.literal('shown'), id: z.string().uuid() }).strict()
])
export type PaletteControl = z.infer<typeof PaletteControlSchema>
const BoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().min(64),
    height: z.number().min(64)
  })
  .strict()
export const PaletteTileSchema = z
  .object({ id: z.string(), label: z.string(), bounds: BoundsSchema, disabled: z.boolean() })
  .strict()
export type PaletteTile = z.infer<typeof PaletteTileSchema>
export const PaletteStateSchema = z
  .object({
    settings: PaletteConfigSchema,
    open: z.boolean(),
    paused: z.boolean(),
    dictating: z.boolean(),
    busy: z.boolean(),
    formula: FormulaLoopStateSchema.nullable().default(null),
    page: z.number().int().nonnegative(),
    pages: z.number().int().positive(),
    reviewPage: z.number().int().nonnegative(),
    reviewPages: z.number().int().positive(),
    composer: z.enum(COMPOSE_PURPOSES).nullable(),
    draft: DraftTextSchema,
    pending: z
      .object({
        id: z.string().uuid(),
        text: DraftTextSchema,
        target: z.string(),
        kind: z.enum(['dictation', 'type-text', 'formula'])
      })
      .strict()
      .nullable(),
    reviewText: z.string(),
    holdProgress: z.number().min(0).max(1),
    dwellId: z.string().nullable(),
    dwellProgress: z.number().min(0).max(1),
    message: z.string().max(500),
    tiles: z.array(PaletteTileSchema).max(100),
    suggestions: z.array(z.object({ label: z.string(), intent: IntentIdSchema }).strict()).max(3)
  })
  .strict()
export type PaletteState = z.infer<typeof PaletteStateSchema>

export function tileAt(
  tiles: readonly PaletteTile[],
  point: { x: number; y: number }
): PaletteTile | undefined {
  return tiles.find(
    ({ bounds: b }) =>
      point.x >= b.x && point.y >= b.y && point.x < b.x + b.width && point.y < b.y + b.height
  )
}

/** Bound review pages by lines as well as characters, including explicit newlines and CJK text. */
export function reviewTextPages(text: string, width: number): string[] {
  const columns = Math.max(12, Math.floor((Math.min(720, width - 24) - 28) / 16))
  const pages: string[] = []
  let page = '',
    line = 0,
    column = 0
  for (const c of text) {
    if (line >= 3) {
      pages.push(page)
      page = ''
      line = 0
      column = 0
    }
    page += c
    if (c === '\n' || ++column >= columns) {
      line++
      column = 0
    }
  }
  if (page || !pages.length) pages.push(page)
  return pages
}
