import { z } from 'zod'
import { BenchOptionsSchema } from './config'
const positive = z.number().finite().positive()
const nonnegative = z.number().finite().nonnegative()
export const BenchConfigSchema = BenchOptionsSchema.extend({
  width: positive.min(300).max(8192),
  height: positive.min(300).max(8192),
  scaleFactor: positive.max(8)
}).strict()
export type BenchConfig = z.infer<typeof BenchConfigSchema>
export const BenchTargetSchema = z
  .object({
    id: z.string().max(80),
    label: z.string().max(80),
    role: z.enum(['target', 'toolbar', 'menu', 'tab', 'link', 'cell']),
    x: nonnegative,
    y: nonnegative,
    width: positive,
    height: positive
  })
  .strict()
export type BenchTarget = z.infer<typeof BenchTargetSchema>
export const BenchTrialSchema = z
  .object({
    index: z.number().int().nonnegative(),
    target: BenchTargetSchema,
    start: nonnegative,
    end: nonnegative,
    selectionMs: nonnegative,
    outcome: z.enum(['hit', 'miss', 'timeout']),
    click: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        button: z.number().int().min(0).max(2)
      })
      .strict()
      .nullable(),
    latencyMs: z.array(nonnegative).max(20000),
    droppedLatency: z.number().int().nonnegative()
  })
  .strict()
  .refine(
    (v) =>
      v.end >= v.start &&
      v.selectionMs <= v.end - v.start &&
      (v.outcome === 'timeout') === (v.click === null),
    'Inconsistent trial timing or click outcome'
  )
export type BenchTrial = z.infer<typeof BenchTrialSchema>
export const BenchSessionSchema = z
  .object({
    version: z.literal(1),
    config: BenchConfigSchema,
    startedAt: nonnegative,
    endedAt: nonnegative,
    trials: z.array(BenchTrialSchema).max(100),
    status: z.enum(['complete', 'cancelled'])
  })
  .strict()
  .refine(
    (v) =>
      v.endedAt >= v.startedAt &&
      v.trials.every(
        (t, i) =>
          t.index === i &&
          t.start >= v.startedAt &&
          t.end <= v.endedAt &&
          (i === 0 || t.start >= v.trials[i - 1]!.end)
      ),
    'Inconsistent session trial order'
  )
export type BenchSession = z.infer<typeof BenchSessionSchema>
export const BenchControlSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('start'), config: BenchConfigSchema }).strict(),
  z
    .object({
      operation: z.literal('click'),
      x: z.number().finite(),
      y: z.number().finite(),
      button: z.number().int().min(0).max(2)
    })
    .strict(),
  z.object({ operation: z.enum(['cancel', 'delete', 'open', 'close']) }).strict()
])
export type BenchControl = z.infer<typeof BenchControlSchema>
export const BenchStateSchema = z
  .object({
    open: z.boolean(),
    running: z.boolean(),
    paused: z.boolean(),
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    config: BenchConfigSchema.nullable(),
    target: BenchTargetSchema.nullable(),
    layout: z.array(BenchTargetSchema).max(100),
    message: z.string().max(1000),
    report: z.string().max(20000)
  })
  .strict()
export type BenchState = z.infer<typeof BenchStateSchema>
