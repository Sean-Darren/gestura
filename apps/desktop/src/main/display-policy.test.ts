import { describe, expect, it } from 'vitest'
import { affectsPointerCoordinates } from './display-policy'

describe('display coordinate changes', () => {
  it('ignores fullscreen Dock and menu-bar work-area changes', () => {
    expect(affectsPointerCoordinates(['workArea'])).toBe(false)
    expect(affectsPointerCoordinates([])).toBe(false)
  })
  it.each(['bounds', 'scaleFactor', 'rotation'])('invalidates on %s', (metric) => {
    expect(affectsPointerCoordinates([metric])).toBe(true)
    expect(affectsPointerCoordinates(['workArea', metric])).toBe(true)
  })
})
