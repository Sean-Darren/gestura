import { z } from 'zod'
export const FieldTextSchema = z
  .string()
  .max(10000)
  .refine((value) =>
    Array.from(value).every((c) => {
      const unit = c.charCodeAt(0)
      return (
        unit !== 127 &&
        (unit >= 32 || unit === 9 || unit === 10 || unit === 13) &&
        !(c.length === 1 && unit >= 0xd800 && unit <= 0xdfff)
      )
    })
  )
export const FocusedTextSchema = z
  .object({ token: z.string().uuid(), selectedText: FieldTextSchema })
  .strict()
export type FocusedText = z.infer<typeof FocusedTextSchema>
export const TextRegisterSchema = z.enum(['standard_written', 'colloquial_cantonese'])
export type TextRegister = z.infer<typeof TextRegisterSchema>
export const PlainTextRequestSchema = z
  .object({
    operation: z.enum(['rewrite', 'reply', 'translate-en', 'translate-zh']),
    instruction: FieldTextSchema,
    selectedText: FieldTextSchema,
    register: TextRegisterSchema
  })
  .strict()
  .refine((r) => (r.operation === 'reply' ? !!r.instruction.trim() : !!r.selectedText.trim()))
export type PlainTextRequest = z.infer<typeof PlainTextRequestSchema>
export const PlainTextResponseSchema = z
  .object({
    status: z.enum(['ok', 'needs_clarification', 'unsupported']),
    text: FieldTextSchema,
    register: TextRegisterSchema,
    explanation: z.string().min(1).max(1000)
  })
  .strict()
  .refine((r) => r.status !== 'ok' || !!r.text.trim())
export type PlainTextResponse = z.infer<typeof PlainTextResponseSchema>
export const FieldWriteSchema = z
  .object({
    text: FieldTextSchema,
    fieldToken: z.string().uuid(),
    insertedText: FieldTextSchema.optional()
  })
  .strict()
