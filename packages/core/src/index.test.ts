import { describe, expect, it } from 'vitest'
import { createIpcEnvelope, IpcEnvelopeSchema, parseIpcChannel, parseIpcEnvelope } from './index'

describe('IPC envelope', () => {
  it('creates a timestamped envelope for an allowed channel', () => {
    const envelope = createIpcEnvelope('app:ready', {})

    expect(IpcEnvelopeSchema.safeParse(envelope).success).toBe(true)
    expect(envelope.channel).toBe('app:ready')
    expect(envelope.t).toBeGreaterThan(0)
  })

  it('rejects channels outside the allowlist', () => {
    expect(() => parseIpcChannel('system:exec')).toThrow()
    expect(() => parseIpcEnvelope({ channel: 'system:exec', payload: {}, t: 1 })).toThrow()
  })

  it('validates the payload associated with an allowed channel', () => {
    expect(() =>
      parseIpcEnvelope({ channel: 'app:status', payload: { status: 'unknown' }, t: 1 })
    ).toThrow()
  })
})
