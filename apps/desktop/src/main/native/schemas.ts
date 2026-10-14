import { z } from 'zod'

const coordinate = z.number().finite().min(-2_147_483_648).max(2_147_483_647)
export const MoveArgsSchema = z.tuple([coordinate, coordinate])
export const EmptyArgsSchema = z.tuple([])
export const ButtonArgsSchema = z.tuple([z.enum(['left', 'right', 'middle'])])
export const ScrollArgsSchema = z.tuple([
  z.number().int().min(-10_000).max(10_000),
  z.number().int().min(-10_000).max(10_000)
])
export const TextSchema = z
  .string()
  .max(10_000)
  .refine((text) => !text.includes('\0'), 'NUL is not supported')
export const PointSchema = z.object({ x: coordinate, y: coordinate }).strict()
export const DisplaysSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      bounds: z
        .object({
          x: coordinate,
          y: coordinate,
          width: z.number().positive(),
          height: z.number().positive()
        })
        .strict(),
      scaleFactor: z.number().positive(),
      primary: z.boolean(),
      coordinateSpace: z.enum(['points', 'pixels'])
    })
    .strict()
)

const modifiers = ['primary', 'control', 'meta', 'shift', 'alt'] as const
const keys = [
  ...modifiers,
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  'enter',
  'tab',
  'escape',
  'space',
  'backspace',
  'delete',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'home',
  'end',
  'pageup',
  'pagedown',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`)
]
export const ComboArgsSchema = z.tuple([
  z
    .array(z.string().refine((key) => keys.includes(key), 'Unknown key'))
    .min(1)
    .max(5)
    .superRefine((combo, context) => {
      if (new Set(combo).size !== combo.length)
        context.addIssue({ code: 'custom', message: 'Duplicate shortcut keys' })
      if (combo.filter((key) => !modifiers.some((modifier) => modifier === key)).length !== 1)
        context.addIssue({ code: 'custom', message: 'Exactly one non-modifier key is required' })
      if (combo.includes('primary') && (combo.includes('control') || combo.includes('meta')))
        context.addIssue({
          code: 'custom',
          message: 'primary cannot be combined with control or meta'
        })
    })
])
