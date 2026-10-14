import { describe, expect, it } from 'vitest'
import { ActionGate, isConfirmedAction, type ProposedAction } from './index'

function action(): ProposedAction {
  return { kind: 'insert-formula', content: { formula: '=SUM(A1:A3)' } }
}

describe('ActionGate', () => {
  it.each(['voice-confirm', 'held-mouth-gesture'] as const)(
    'mints a confirmed action for %s evidence',
    (kind) => {
      const gate = new ActionGate(() => 100)
      const id = gate.propose(action())
      const confirmed = gate.confirm(id, { kind })

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

    expect(gate.confirm(id, { kind: 'voice-confirm' })).toBeNull()
  })

  it('accepts a proposal just under 60 seconds old', () => {
    let now = 1_000
    const gate = new ActionGate(() => now)
    const id = gate.propose(action())
    now += 59_999

    expect(gate.confirm(id, { kind: 'voice-confirm' })).not.toBeNull()
  })

  it('rejects content that changed after proposal', () => {
    const gate = new ActionGate(() => 100)
    const proposal = action()
    const id = gate.propose(proposal)
    proposal.content = { formula: '=DELETE(A1)' }

    expect(gate.confirm(id, { kind: 'voice-confirm' })).toBeNull()
  })

  it('rejects unknown and already-used proposal ids', () => {
    const gate = new ActionGate(() => 100)
    const id = gate.propose(action())

    expect(gate.confirm('missing', { kind: 'voice-confirm' })).toBeNull()
    expect(gate.confirm(id, { kind: 'voice-confirm' })).not.toBeNull()
    expect(gate.confirm(id, { kind: 'voice-confirm' })).toBeNull()
  })

  it('does not recognize an object that was not minted by this gate', () => {
    expect(isConfirmedAction({ id: 'forged', action: action(), confirmedAt: 1 })).toBe(false)
  })
})
