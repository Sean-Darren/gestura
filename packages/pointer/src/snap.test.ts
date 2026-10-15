import { describe, expect, it } from 'vitest'
import type { UiElement } from '@gestura/core'
import { DEFAULT_SNAP_CONFIG } from '@gestura/core/config'
import { SnapSelector, targetScore } from './snap'
const button = (x: number, y = 100, width = 24, height = 24): UiElement => ({
  bounds: { x, y, width, height },
  role: 'button',
  name: 'Test',
  isEnabled: true,
  isOffscreen: false,
  isClickable: true
})
describe('pure target snapping', () => {
  it('picks the nearest plausible target and rejects large, disabled, offscreen or distant controls', () => {
    const a = button(100),
      b = button(160),
      point = { x: 123, y: 112 }
    const bad = [
      button(0, 0, 301, 300),
      button(0, 0, 300, 301),
      { ...a, isEnabled: false },
      { ...a, isOffscreen: true },
      { ...a, isClickable: false },
      button(500)
    ]
    const selector = new SnapSelector()
    expect(selector.update(point, undefined, [...bad, b, a], 0)).toEqual(a)
    for (const t of bad) expect(targetScore(point, undefined, t)).toBe(Infinity)
    expect(targetScore({ x: 40, y: 112 }, undefined, a)).toBeLessThan(Infinity)
    expect(targetScore({ x: 39, y: 112 }, undefined, a)).toBe(Infinity)
  })
  it('uses bounded target-size distance, control priors and optional gaze', () => {
    const a = button(100),
      b = { ...button(100), role: 'link' as const }
    expect(new SnapSelector().update({ x: 112, y: 112 }, undefined, [b, a], 0)?.role).toBe('button')
    const left = button(100),
      right = button(130),
      point = { x: 127, y: 112 }
    const cfg = { ...DEFAULT_SNAP_CONFIG, gazeWeight: 1 }
    expect(new SnapSelector(cfg).update(point, { x: 142, y: 112 }, [left, right], 0)).toEqual(right)
    expect(targetScore(point, undefined, button(100, 100, 48, 24))).toBeLessThan(
      targetScore({ x: 130, y: 112 }, undefined, button(100))
    )
  })
  it('requires a continuous advantage for 100ms and resets an interrupted challenge', () => {
    const a = button(100),
      b = button(124),
      s = new SnapSelector()
    expect(s.update({ x: 110, y: 112 }, undefined, [a, b], 0)).toEqual(a)
    expect(s.update({ x: 140, y: 112 }, undefined, [a, b], 10)).toEqual(a)
    expect(s.update({ x: 140, y: 112 }, undefined, [a, b], 109)).toEqual(a)
    expect(s.update({ x: 140, y: 112 }, undefined, [a, b], 110)).toEqual(b)
    s.update({ x: 110, y: 112 }, undefined, [a, b], 120)
    s.update({ x: 140, y: 112 }, undefined, [a, b], 150)
    expect(s.update({ x: 110, y: 112 }, undefined, [a, b], 200)).toEqual(b)
    expect(s.update({ x: 110, y: 112 }, undefined, [a, b], 299)).toEqual(b)
    expect(s.update({ x: 110, y: 112 }, undefined, [a, b], 300)).toEqual(a)
  })
  it('drops invalid incumbents and resets stale or out-of-order history', () => {
    const a = button(100),
      b = button(124),
      s = new SnapSelector()
    s.update({ x: 110, y: 112 }, undefined, [a, b], 0)
    expect(s.update({ x: 140, y: 112 }, undefined, [b], 10)).toEqual(b)
    expect(s.update({ x: 500, y: 500 }, undefined, [a, b], 20)).toBeUndefined()
    expect(s.update({ x: 110, y: 112 }, undefined, [a, b], 19)).toBeUndefined()
    s.update({ x: 110, y: 112 }, undefined, [a, b], 30)
    expect(s.update({ x: 140, y: 112 }, undefined, [a, b], 1000)).toEqual(b)
  })
})
