import { describe, expect, it } from 'vitest'
import { createPairingToken, tokensMatch } from './token'

describe('pairing token', () => {
  it('generates a 64-hex-character token', () => {
    expect(createPairingToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches equal tokens', () => {
    expect(tokensMatch('abc123', 'abc123')).toBe(true)
  })

  it('rejects a different token of equal length', () => {
    expect(tokensMatch('abc123', 'abd123')).toBe(false)
  })

  it('rejects a token of a different length without comparing buffers', () => {
    expect(tokensMatch('abc123', 'abc')).toBe(false)
  })

  it('rejects an empty provided token', () => {
    expect(tokensMatch('abc123', '')).toBe(false)
  })
})
