import { z } from 'zod'
const Text = z
  .string()
  .max(16000)
  .refine((s) => !s.includes('\0'))
export const CodeContextSchema = z
  .object({
    languageId: z.string().min(1).max(100),
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine((s) => !/[\\/]/.test(s)),
    selection: Text,
    surroundingLines: z.array(z.string().max(4000)).max(40)
  })
  .strict()
  .refine((c) => c.surroundingLines.join('\n').length <= 16000)
export type CodeContext = z.infer<typeof CodeContextSchema>
export const CodeResponseSchema = z
  .object({
    status: z.enum(['ok', 'needs_clarification', 'unsupported']),
    code: Text,
    insertMode: z.enum(['replace_selection', 'insert_at_cursor']),
    explanation: z
      .object({ en: z.string().min(1).max(1000), zh_hk: z.string().min(1).max(1000) })
      .strict()
  })
  .strict()
  .refine((r) => r.status !== 'ok' || r.code.length > 0)
export type CodeResponse = z.infer<typeof CodeResponseSchema>
export const CodeRequestSchema = z
  .object({
    utterance: z.string().trim().min(1).max(10000),
    lang: z.enum(['en', 'yue', 'mixed']),
    context: CodeContextSchema,
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: Text }).strict())
      .max(20)
  })
  .strict()
export type CodeRequest = z.infer<typeof CodeRequestSchema>
// Opaque handle: the URI, version, selection and previous document stay in the extension.
export const CodeSnapshotSchema = z
  .object({
    token: z.string().uuid(),
    context: CodeContextSchema
  })
  .strict()
export type CodeSnapshot = z.infer<typeof CodeSnapshotSchema>
export const CodePairingSchema = z
  .object({
    port: z.number().int().min(1024).max(65535),
    token: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
export const CodeCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('context'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('preview'),
      id: z.string().uuid(),
      snapshot: z.string().uuid(),
      response: CodeResponseSchema
    })
    .strict(),
  z
    .object({
      type: z.literal('apply'),
      id: z.string().uuid(),
      snapshot: z.string().uuid(),
      preview: z.string().uuid()
    })
    .strict(),
  z
    .object({ type: z.literal('undoPreview'), id: z.string().uuid(), snapshot: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('undo'),
      id: z.string().uuid(),
      snapshot: z.string().uuid(),
      preview: z.string().uuid()
    })
    .strict(),
  z.object({ type: z.literal('pause'), paused: z.boolean() }).strict(),
  z.object({ type: z.literal('cancel') }).strict()
])
export type CodeCommand = z.infer<typeof CodeCommandSchema>
export const CodeEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('context'),
      id: z.string().uuid(),
      snapshot: CodeSnapshotSchema.nullable()
    })
    .strict(),
  z.object({ type: z.literal('result'), id: z.string().uuid(), ok: z.boolean() }).strict()
])
export type CodeEvent = z.infer<typeof CodeEventSchema>
