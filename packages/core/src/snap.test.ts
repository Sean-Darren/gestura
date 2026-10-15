import { expect, it } from 'vitest'
import { SnapPreferencesSchema, SnapControlSchema, SnapBoundsSchema } from './snap'
import { DEFAULT_SNAP_CONFIG, SnapConfigSchema } from './config'
import { createIpcEnvelope } from './index'
it('validates snapping settings and keeps per-app commands narrow', () => {
  expect(DEFAULT_SNAP_CONFIG).toMatchObject({ radiusPx: 60, switchMs: 100 })
  for (const invalid of [
    { radiusPx: 0 },
    { switchMs: 99 },
    { switchMargin: -1 },
    { rolePriors: { button: -1 } }
  ])
    expect(SnapConfigSchema.safeParse(invalid).success).toBe(false)
  expect(
    SnapControlSchema.safeParse({ appId: 'com.test', enabled: true, command: 'confirm' }).success
  ).toBe(false)
  expect(SnapBoundsSchema.safeParse({ x: 0, y: 0, width: NaN, height: 1 }).success).toBe(false)
  expect(SnapPreferencesSchema.safeParse({ version: 2, apps: {} }).success).toBe(false)
  expect(createIpcEnvelope('snap:control', { appId: 'com.test', enabled: true }).channel).toBe(
    'snap:control'
  )
})
