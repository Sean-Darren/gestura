import { expect, it } from 'vitest'
import { BenchConfigSchema, BenchControlSchema } from './pointing-bench'
import { createIpcEnvelope } from './index'
it('keeps benchmark IPC narrow and saving opt-in', () => {
  const c = BenchConfigSchema.parse({ mode: 'standard', width: 800, height: 500, scaleFactor: 2 })
  expect(c.persist).toBe(false)
  expect(createIpcEnvelope('bench:control', { operation: 'start', config: c }).channel).toBe(
    'bench:control'
  )
  for (const invalid of [
    { operation: 'delete', path: '/' },
    { operation: 'click', x: NaN, y: 0, button: 0 },
    { operation: 'click', x: 0, y: 0, button: 4 },
    { operation: 'start', config: { ...c, width: 100 } },
    { operation: 'upload' }
  ])
    expect(BenchControlSchema.safeParse(invalid).success).toBe(false)
})
