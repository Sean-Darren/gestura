import { describe, expect, it } from 'vitest'
import { IntentMatcher } from './matcher'
const matcher = new IntentMatcher()
describe('multilingual intent matcher', () => {
  it.each([
    ['CLICK!', 'click'],
    ['double-click', 'double-click'],
    ['撳兩下', 'double-click'],
    ['撳右掣', 'right-click'],
    ['暫停輸入', 'pause'],
    ['暂停输入', 'pause'],
    ['幫我 resume', 'resume'],
    ['開 phrase palette', 'open-phrase-palette'],
    ['drag on', 'drag-on'],
    ['關 drag', 'drag-off'],
    ['scroll 上去', 'scroll-up'],
    ['scroll 落去', 'scroll-down'],
    ['開聽寫', 'dictation-on'],
    ['stop dictation', 'dictation-off'],
    ['undo 上一步', 'undo-that']
  ])('matches %s as %s', (text, id) => {
    const result = matcher.match(text)
    expect(result.kind).toBe('match')
    if (result.kind === 'match') expect(result.intent).toEqual({ id, slots: {} })
  })
  it.each(['go to B two', 'go to bee two', '揀 B二', '揀 cell Ｂ２'])('extracts %s', (text) => {
    const result = matcher.match(text)
    expect(result.kind === 'match' && result.intent).toEqual({
      id: 'go-to',
      slots: { range: 'B2' }
    })
  })
  it('extracts ranges and preserves original formula punctuation, script, case and symbols', () => {
    expect(matcher.match('go to BEE2')).toMatchObject({
      intent: { id: 'go-to', slots: { range: 'BEE2' } }
    })
    const range = matcher.match('揀 A1 到 A10')
    expect(range.kind === 'match' && range.intent).toEqual({
      id: 'go-to',
      slots: { range: 'A1:A10' }
    })
    const request = 'IF(A1>2, "是", "否") + $B$2 / 100%'
    const result = matcher.match(`幫我寫公式 ${request}`)
    expect(result.kind === 'match' && result.intent).toEqual({
      id: 'formula-request',
      slots: { request }
    })
  })
  it('uses conservative fuzzy matching with confidence and stable top-three suggestions', () => {
    const result = matcher.match('scrol down')
    expect(result.kind === 'match' && result.method).toBe('fuzzy')
    expect(result.kind === 'match' && result.intent.id).toBe('scroll-down')
    expect(result.kind === 'match' && result.confidence).toBeGreaterThanOrEqual(0.86)
    const unknown = matcher.match('unrelated sentence about the weather')
    expect(unknown.kind).toBe('suggestions')
    if (unknown.kind === 'suggestions') {
      expect(unknown.suggestions).toHaveLength(3)
      expect(unknown.suggestions.map((s) => s.intent.id)).not.toContain('confirm')
      expect(unknown.suggestions.map((s) => s.intent.id)).not.toContain('cancel')
    }
    expect(matcher.match('unrelated sentence about the weather')).toEqual(unknown)
  })
  it('routes low confidence Excel input as data for GenAI, preserving its exact text', () => {
    const text = '請計總數：$A$1:$A$10，保留 2 位小數。'
    expect(matcher.match(text, { app: 'excel' })).toMatchObject({
      kind: 'genai-request',
      intent: { id: 'formula-request', slots: { request: text } }
    })
    expect(matcher.match(text).kind).toBe('suggestions')
  })
  it('requires a pending proposal and explicit voice timing; fuzzy/gaze suggestions never confirm', () => {
    expect(matcher.match('確認', {}, 100).kind).toBe('suggestions')
    expect(matcher.match('confirm', { pendingProposal: true }).kind).toBe('suggestions')
    expect(matcher.match('confirm', { pendingProposal: true }, 100)).toEqual({
      kind: 'match',
      intent: { id: 'confirm', slots: {} },
      confidence: 1,
      method: 'template',
      evidence: { kind: 'voice-confirm', tSpeechStart: 100 }
    })
    for (const text of ['confrm', 'confirm this please', 'do not confirm', 'cancelled'])
      expect(matcher.match(text, { pendingProposal: true }, 100)).not.toMatchObject({
        intent: { id: 'confirm' }
      })
    for (const text of ['confrm', 'cancle']) {
      const result = new IntentMatcher({ fuzzyThreshold: 0.7 }).match(
        text,
        { pendingProposal: true },
        100
      )
      expect(result).not.toMatchObject({ intent: { id: 'confirm' } })
      expect(result).not.toMatchObject({ intent: { id: 'cancel' } })
    }
    expect(matcher.match('取消', { pendingProposal: true })).toMatchObject({
      kind: 'match',
      intent: { id: 'cancel' }
    })
    expect(matcher.match('取消', { app: 'excel' })).toMatchObject({
      kind: 'suggestions',
      reason: 'pending-required'
    })
  })
  it('does not repair invalid cells or guess ambiguous commands', () => {
    for (const cell of ['AAAA1', 'XFE1', 'A0', 'A01', 'A1048577'])
      expect(matcher.match(`go to ${cell}`)).not.toMatchObject({ intent: { id: 'go-to' } })
    expect(
      new IntentMatcher({ fuzzyThreshold: 0.7 }).match('select range A1:B0')
    ).not.toMatchObject({ intent: { id: 'go-to' } })
    expect(matcher.match('selct range B2')).toMatchObject({
      kind: 'match',
      method: 'fuzzy',
      intent: { id: 'go-to', slots: { range: 'B2' } }
    })
    const result = new IntentMatcher({ fuzzyThreshold: 0.7, ambiguityMargin: 0.5 }).match('drag o')
    expect(result).toMatchObject({ kind: 'suggestions', reason: 'ambiguous' })
    expect(matcher.match(' '.repeat(3))).toMatchObject({
      kind: 'suggestions',
      reason: 'invalid-input'
    })
    expect(matcher.match('x'.repeat(2001))).toMatchObject({
      kind: 'suggestions',
      reason: 'invalid-input'
    })
  })
})
