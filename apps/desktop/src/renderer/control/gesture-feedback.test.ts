import { describe, expect, it } from 'vitest'
import { GestureDetectionSchema } from '@gestura/core'
import { gestureReasonText } from './gesture-feedback'
describe('gesture feedback', () => {
  it.each(GestureDetectionSchema.shape.reason.options)('explains %s', (reason) => {
    expect(gestureReasonText(reason).length).toBeGreaterThan(10)
  })
  it('does not promise OS delivery when detection succeeds', () => {
    expect(gestureReasonText('accepted')).toContain('Check click delivery')
    expect(gestureReasonText('eyes-not-open')).toContain('both eyes')
  })
})
