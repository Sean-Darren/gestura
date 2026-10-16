import { describe, expect, it } from 'vitest'
import { ActionGate, isConfirmedAction, type ProposedAction } from './index'

function action(): ProposedAction {
  return { kind: 'insert-formula', content: { formula: '=SUM(A1:A3)' } }
}

describe('ActionGate', () => {
  it.each(['voice-confirm', 'held-mouth-gesture'] as const)(
    'mints a confirmed action for %s evidence',
    (kind) => {
      let epoch = 1000
      const gate = new ActionGate(
        () => 100,
        () => epoch
      )
      const id = gate.propose(action())
      gate.markShown(id)
      epoch++
      const confirmed = gate.confirm(
        id,
        kind === 'voice-confirm' ? { kind, tSpeechStart: epoch } : { kind }
      )

      expect(confirmed).not.toBeNull()
      expect(isConfirmedAction(confirmed)).toBe(true)
      expect(confirmed?.action).toEqual(action())
    }
  )

  it.each(['blink', 'wink', 'dwell'] as const)('rejects %s evidence', (kind) => {
    const gate = new ActionGate(() => 100)
    const id = gate.propose(action())

    expect(gate.confirm(id, { kind })).toBeNull()
  })

  it('rejects any unrecognized confirmation evidence', () => {
    const gate = new ActionGate(() => 100)
    const id = gate.propose(action())

    expect(gate.confirm(id, { kind: 'other' })).toBeNull()
  })

  it('expires proposals at 60 seconds', () => {
    let now = 1_000
    const gate = new ActionGate(() => now)
    const id = gate.propose(action())
    now += 60_000

    expect(gate.confirm(id, { kind: 'held-mouth-gesture' })).toBeNull()
  })

  it('accepts a proposal just under 60 seconds old', () => {
    let now = 1_000
    const gate = new ActionGate(() => now)
    const id = gate.propose(action())
    now += 59_999

    expect(gate.confirm(id, { kind: 'held-mouth-gesture' })).not.toBeNull()
  })

  it('rejects content that changed after proposal', () => {
    const gate = new ActionGate(() => 100)
    const proposal = action()
    const id = gate.propose(proposal)
    proposal.content = { formula: '=DELETE(A1)' }

    expect(gate.confirm(id, { kind: 'held-mouth-gesture' })).toBeNull()
  })

  it('rejects unknown and already-used proposal ids', () => {
    const gate = new ActionGate(() => 100)
    const id = gate.propose(action())

    expect(gate.confirm('missing', { kind: 'held-mouth-gesture' })).toBeNull()
    expect(gate.confirm(id, { kind: 'held-mouth-gesture' })).not.toBeNull()
    expect(gate.confirm(id, { kind: 'held-mouth-gesture' })).toBeNull()
  })

  it('does not recognize an object that was not minted by this gate', () => {
    expect(isConfirmedAction({ id: 'forged', action: action(), confirmedAt: 1 })).toBe(false)
  })
  it('accepts voice only after display, using speech onset rather than ASR completion', () => {
    let epoch = 1700000000000
    let monotonic = 100
    const gate = new ActionGate(
      () => monotonic,
      () => epoch
    )
    const id = gate.propose(action())
    expect(gate.confirm(id, { kind: 'voice-confirm', tSpeechStart: epoch - 1 })).toBeNull()
    expect(gate.markShown(id)).toBe(true)
    epoch += 1000
    monotonic += 1000
    for (const tSpeechStart of [epoch - 1001, epoch - 1000, epoch + 1, NaN, Infinity])
      expect(gate.confirm(id, { kind: 'voice-confirm', tSpeechStart })).toBeNull()
    expect(gate.confirm(id, { kind: 'voice-confirm' })).toBeNull()
    const result = gate.confirm(id, { kind: 'voice-confirm', tSpeechStart: epoch - 500 })
    expect(result).not.toBeNull()
    expect(result?.confirmedAt).toBe(monotonic)
  })
  it('requires a new speech onset after the proposal is shown again', () => {
    let epoch = 1000
    const gate = new ActionGate(
      () => 100,
      () => epoch
    )
    const id = gate.propose(action())
    gate.markShown(id)
    epoch = 2000
    gate.markShown(id)
    epoch = 3000
    expect(gate.confirm(id, { kind: 'voice-confirm', tSpeechStart: 1500 })).toBeNull()
    expect(gate.confirm(id, { kind: 'voice-confirm', tSpeechStart: 2500 })).not.toBeNull()
  })
  it('keeps expiry monotonic even when epoch timestamps are valid', () => {
    let now = 0,
      epoch = 1000
    const gate = new ActionGate(
      () => now,
      () => epoch
    )
    const id = gate.propose(action())
    gate.markShown(id)
    now = 60000
    epoch = 2000
    expect(gate.confirm(id, { kind: 'voice-confirm', tSpeechStart: 1500 })).toBeNull()
    expect(gate.markShown(id)).toBe(false)
    expect(gate.markShown('missing')).toBe(false)
  })
})
