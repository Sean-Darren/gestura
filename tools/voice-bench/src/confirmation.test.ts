import { expect, it } from 'vitest'
import { IntentMatcher } from '@gestura/intent'
import { ActionGate } from '../../../apps/desktop/src/main/action-gate'
it('rejects speech begun before a proposal appeared even if ASR completes afterward', () => {
  const matcher = new IntentMatcher()
  let epoch = 10000
  const gate = new ActionGate(
    () => 100,
    () => epoch
  )
  const id = gate.propose({ kind: 'insert-formula', content: '=SUM(A1:A3)' })
  gate.markShown(id)
  epoch = 11000
  const early = matcher.match('確認', { pendingProposal: true }, 9999)
  expect(early.kind).toBe('match')
  if (early.kind === 'match') expect(gate.confirm(id, early.evidence)).toBeNull()
  const fresh = matcher.match('confirm', { pendingProposal: true }, 10500)
  if (fresh.kind !== 'match') throw new Error('Confirmation failed to match')
  expect(gate.confirm(id, fresh.evidence)).not.toBeNull()
  expect(gate.confirm(id, fresh.evidence)).toBeNull()
})
