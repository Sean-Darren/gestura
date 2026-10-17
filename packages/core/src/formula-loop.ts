import { z } from 'zod'
export const FormulaLoopStateSchema = z
  .object({
    phase: z.enum([
      'idle',
      'thinking',
      'correcting',
      'proposed',
      'writing',
      'written',
      'undo-proposed',
      'restoring',
      'cancelled',
      'error',
      'clarification'
    ]),
    proposalId: z.string().uuid().nullable(),
    formula: z.string().max(16000),
    explanation: z.string().max(1000),
    target: z.string().max(300),
    references: z.array(z.string().max(100)).max(100),
    correction: z.number().int().nonnegative(),
    lang: z.enum(['en', 'yue', 'mixed']),
    previous: z.string().max(32767),
    canUndo: z.boolean(),
    bounds: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().min(280),
        height: z.number().min(280)
      })
      .strict()
      .nullable(),
    reviewText: z.string(),
    reviewPage: z.number().int().nonnegative(),
    reviewPages: z.number().int().positive(),
    reviewKind: z.enum(['formula', 'explanation', 'previous'])
  })
  .strict()
export type FormulaLoopState = z.infer<typeof FormulaLoopStateSchema>
