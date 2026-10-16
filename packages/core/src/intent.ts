import { z } from 'zod'

export const INTENT_IDS = [
  'click',
  'double-click',
  'right-click',
  'drag-on',
  'drag-off',
  'scroll-up',
  'scroll-down',
  'pause',
  'resume',
  'open-phrase-palette',
  'dictation-on',
  'dictation-off',
  'undo-that',
  'go-to',
  'confirm',
  'cancel',
  'formula-request'
] as const
export const IntentIdSchema = z.enum(INTENT_IDS)
const empty = z.object({}).strict()
const plainIds = [
  'click',
  'double-click',
  'right-click',
  'drag-on',
  'drag-off',
  'scroll-up',
  'scroll-down',
  'pause',
  'resume',
  'open-phrase-palette',
  'dictation-on',
  'dictation-off',
  'undo-that',
  'confirm',
  'cancel'
] as const
export const CellRangeSchema = z
  .string()
  .regex(/^[A-Z]{1,3}[1-9]\d{0,6}(?::[A-Z]{1,3}[1-9]\d{0,6})?$/)
  .refine(
    (value) =>
      value.split(':').every((cell) => {
        const parts = /^([A-Z]+)(\d+)$/.exec(cell)
        if (!parts) return false
        const column = [...parts[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
        return column <= 16384 && Number(parts[2]) <= 1048576
      }),
    'Cell reference exceeds Excel bounds'
  )
export const IntentSchema = z.discriminatedUnion('id', [
  z.object({ id: z.enum(plainIds), slots: empty }).strict(),
  z
    .object({ id: z.literal('go-to'), slots: z.object({ range: CellRangeSchema }).strict() })
    .strict(),
  z
    .object({
      id: z.literal('formula-request'),
      slots: z
        .object({
          request: z
            .string()
            .min(1)
            .max(16000)
            .refine((value) => !!value.trim())
        })
        .strict()
    })
    .strict()
])
export type Intent = z.infer<typeof IntentSchema>
export type IntentId = z.infer<typeof IntentIdSchema>
export const VoiceConfirmationEvidenceSchema = z
  .object({
    kind: z.literal('voice-confirm'),
    tSpeechStart: z.number().finite().nonnegative()
  })
  .strict()
export type VoiceConfirmationEvidence = z.infer<typeof VoiceConfirmationEvidenceSchema>
export const ConfirmationEvidenceSchema = z.union([
  VoiceConfirmationEvidenceSchema,
  z.object({ kind: z.literal('held-mouth-gesture') }).strict()
])
export type ConfirmationEvidence = z.infer<typeof ConfirmationEvidenceSchema>
export const IntentContextSchema = z
  .object({
    app: z.enum(['excel', 'other']).default('other'),
    pendingProposal: z.boolean().default(false)
  })
  .strict()
export type IntentContext = z.infer<typeof IntentContextSchema>
const phrasing = z.array(z.string().min(1).max(200)).min(1).max(30)
export const CommandCatalogueSchema = z
  .object({
    version: z.literal(1),
    commands: z
      .array(
        z
          .object({
            id: IntentIdSchema,
            slots: z.record(z.string(), z.enum(['range', 'free-text'])),
            pendingOnly: z.boolean().default(false),
            exactOnly: z.boolean().default(false),
            phrasings: z.object({ en: phrasing, yue: phrasing, mixed: phrasing }).strict()
          })
          .strict()
      )
      .length(INTENT_IDS.length)
  })
  .strict()
  .superRefine((data, ctx) => {
    const ids = new Set(data.commands.map((c) => c.id))
    if (ids.size !== INTENT_IDS.length)
      ctx.addIssue({ code: 'custom', message: 'Every intent must occur exactly once' })
    for (const command of data.commands) {
      const expected =
        command.id === 'go-to'
          ? { range: 'range' }
          : command.id === 'formula-request'
            ? { request: 'free-text' }
            : {}
      if (JSON.stringify(command.slots) !== JSON.stringify(expected))
        ctx.addIssue({ code: 'custom', message: `Invalid slots for ${command.id}` })
      const protectedCommand = command.id === 'confirm' || command.id === 'cancel'
      if (command.pendingOnly !== protectedCommand || command.exactOnly !== protectedCommand)
        ctx.addIssue({
          code: 'custom',
          message: 'Confirmation/cancellation must be pending-only and exact-only'
        })
      for (const variants of Object.values(command.phrasings))
        for (const text of variants) {
          if (command.id === 'formula-request' && !text.endsWith('{request}'))
            ctx.addIssue({
              code: 'custom',
              message: 'Free-text request must be the final template slot'
            })
          const slots = [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!).sort()
          if (slots.join(',') !== Object.keys(expected).sort().join(','))
            ctx.addIssue({
              code: 'custom',
              message: `Missing or unknown template slot in ${command.id}`
            })
        }
    }
  })
