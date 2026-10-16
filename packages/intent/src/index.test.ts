import { describe, expect, it } from 'vitest'
import { packageName, IntentMatcher } from './index'

describe('@gestura/intent', () => {
  it('exports the matcher through its public package entry', () => {
    expect(packageName).toBe('@gestura/intent')
    expect(new IntentMatcher().match('click')).toMatchObject({
      kind: 'match',
      intent: { id: 'click' }
    })
  })
})
