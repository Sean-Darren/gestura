import { expect, it } from 'vitest'
import { MockNativeInput } from '@gestura/native/mock'
import { createNativeInput } from './index'
import { PauseController } from '../pause'
import { ActionGate } from '../action-gate'
import type { ConfirmedAction } from '../action-gate'
it('rejects forged, mismatched and reused field capabilities and checks pause before capture', async () => {
  const native = new MockNativeInput(),
    pause = new PauseController(),
    bridge = createNativeInput(pause, () => native)
  native.focusedText = { token: crypto.randomUUID(), selectedText: 'old' }
  const snapshot = await bridge.captureFocusedText(),
    gate = new ActionGate()
  await expect(
    bridge.typeText('x', {
      action: { kind: 'plain-text', content: { text: 'x', fieldToken: snapshot!.token } }
    } as unknown as ConfirmedAction)
  ).rejects.toThrow()
  const wrong = gate.confirm(
    gate.propose({ kind: 'plain-text', content: { text: 'x', fieldToken: crypto.randomUUID() } }),
    { kind: 'held-mouth-gesture' }
  )!
  expect(await bridge.typeText('x', wrong)).toBe(false)
  const action = gate.confirm(
    gate.propose({
      kind: 'plain-text',
      content: { text: '你好 😀 = ( ) : $', fieldToken: snapshot!.token }
    }),
    { kind: 'held-mouth-gesture' }
  )!
  expect(await bridge.typeText('你好 😀 = ( ) : $', action)).toBe(true)
  await expect(bridge.typeText('你好 😀 = ( ) : $', action)).rejects.toThrow()
  pause.toggle()
  expect(await bridge.captureFocusedText()).toBeUndefined()
  bridge.dispose()
})
it('stops a chunked insertion when the native field guard changes', async () => {
  class ChangingField extends MockNativeInput {
    override typeText(text: string): void {
      super.typeText(text)
      this.fieldCurrent = false
    }
  }
  const native = new ChangingField(),
    pause = new PauseController(),
    bridge = createNativeInput(pause, () => native)
  native.focusedText = { token: crypto.randomUUID(), selectedText: '' }
  const snapshot = await bridge.captureFocusedText(),
    gate = new ActionGate(),
    text = '你好😀'.repeat(30)
  const confirmed = gate.confirm(
    gate.propose({ kind: 'plain-text', content: { text, fieldToken: snapshot!.token } }),
    { kind: 'held-mouth-gesture' }
  )!
  expect(await bridge.typeText(text, confirmed)).toBe(false)
  expect(native.calls.filter((c) => c.method === 'typeText')).toHaveLength(1)
  bridge.dispose()
})
