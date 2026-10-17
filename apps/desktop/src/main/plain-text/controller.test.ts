import { describe, expect, it, vi } from 'vitest'
import { MockProvider, PlainTextRouter } from '@gestura/genai'
import { MockNativeInput } from '@gestura/native/mock'
import type { ConfirmationEvidence, PlainTextRequest, PlainTextResponse } from '@gestura/core'
import { createNativeInput } from '../native'
import { PauseController } from '../pause'
import { ActionGate } from '../action-gate'
import { PlainTextController } from './controller'
const selected = '我聽日唔得閒'
const written: PlainTextResponse = {
  status: 'ok',
  text: '本人明日未能出席。',
  register: 'standard_written',
  explanation: '改為正式書面語。'
}
function setup(selection = selected): {
  controller: PlainTextController
  native: MockNativeInput
  provider: MockProvider
  gate: ActionGate
  pause: PauseController
  generate: ReturnType<typeof vi.spyOn>
  shown(): void
  time(value: number): void
} {
  let now = 1000
  const native = new MockNativeInput(),
    pause = new PauseController(),
    gate = new ActionGate(undefined, () => now)
  native.focusedText = { token: crypto.randomUUID(), selectedText: selection }
  const provider = new MockProvider({ throwOnUnknown: true })
  const initial: PlainTextRequest = {
    operation: 'rewrite',
    instruction: '',
    selectedText: selection,
    register: 'standard_written'
  }
  provider.set(JSON.stringify(initial), written)
  provider.set(JSON.stringify({ ...initial, register: 'colloquial_cantonese' }), {
    ...written,
    text: '我聽日嚟唔到呀。',
    register: 'colloquial_cantonese'
  })
  const generate = vi.spyOn(provider, 'generate'),
    router = new PlainTextRouter(provider)
  const controller = new PlainTextController({
    gate,
    pause,
    bridge: createNativeInput(pause, () => native),
    now: () => now,
    display: () => ({ width: 1280, height: 800 }),
    publish: vi.fn(),
    generate: (request, signal) => router.generate(request, signal)
  })
  return {
    controller,
    native,
    provider,
    gate,
    pause,
    generate,
    shown() {
      while (controller.state.reviewPage < controller.state.reviewPages - 1) controller.review(1)
      controller.present(controller.state.proposalId!)
      now++
    },
    time(value) {
      now = value
    }
  }
}
const writes = (native: MockNativeInput): unknown[] =>
  native.calls.filter((c) => c.method === 'typeText' || c.method === 'keyCombo')
describe('plain text with MockProvider and native bridge', () => {
  it('requires review and fresh voice/mouth evidence; duplicate and click confirmations cannot type', async () => {
    const s = setup()
    s.controller.request('rewrite')
    await s.controller.settle()
    expect(s.controller.state.phase).toBe('proposed')
    expect(writes(s.native)).toEqual([])
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(writes(s.native)).toEqual([])
    s.shown()
    for (const kind of ['blink', 'wink', 'dwell'])
      await s.controller.confirm({ kind } as unknown as ConfirmationEvidence)
    await s.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 999 })
    expect(writes(s.native)).toEqual([])
    await Promise.all([
      s.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 1001 }),
      s.controller.confirm({ kind: 'held-mouth-gesture' })
    ])
    expect(s.controller.state.phase).toBe('written')
    expect(writes(s.native)).toHaveLength(1)
    const request = JSON.parse(s.generate.mock.calls[0]![0].messages[1]!.content) as Record<
      string,
      unknown
    >
    expect(Object.keys(request).sort()).toEqual([
      'instruction',
      'operation',
      'register',
      'selectedText'
    ])
    expect(request.selectedText).toBe(selected)
    s.controller.dispose()
  })
  it('register toggle reuses only the original selection, revokes the old proposal and requires new review', async () => {
    const s = setup()
    s.controller.request('rewrite')
    await s.controller.settle()
    s.shown()
    const old = s.controller.state.proposalId!
    s.controller.toggleRegister()
    await s.controller.settle()
    expect(s.controller.state.register).toBe('colloquial_cantonese')
    expect(s.controller.state.formula).toBe('我聽日嚟唔到呀。')
    expect(s.gate.confirm(old, { kind: 'held-mouth-gesture' })).toBeNull()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(writes(s.native)).toEqual([])
    expect(s.native.calls.filter((c) => c.method === 'captureFocusedText')).toHaveLength(1)
    expect(JSON.parse(s.generate.mock.calls[1]![0].messages[1]!.content)).toMatchObject({
      selectedText: selected,
      register: 'colloquial_cantonese'
    })
    s.controller.toggleRegister()
    await s.controller.settle()
    expect(s.controller.state.formula).toBe(written.text)
    s.controller.dispose()
  })
  it('cancel, expiry and pause leave the field untouched', async () => {
    for (const mode of ['cancel', 'expiry', 'pause']) {
      const s = setup()
      s.controller.request('rewrite')
      await s.controller.settle()
      s.shown()
      if (mode === 'cancel') s.controller.cancel()
      if (mode === 'expiry') {
        s.time(62000)
        s.controller.tick()
      }
      if (mode === 'pause') s.pause.toggle()
      await s.controller.confirm({ kind: 'held-mouth-gesture' })
      expect(writes(s.native), mode).toEqual([])
      s.controller.dispose()
    }
  })
  it('rejects an unavailable/noneditable field before any provider request', async () => {
    const s = setup()
    s.native.focusedText = null
    s.controller.request('rewrite')
    await s.controller.settle()
    expect(s.generate).not.toHaveBeenCalled()
    expect(writes(s.native)).toEqual([])
    s.controller.dispose()
  })
  it('rejects changed focus/selection at insertion and before undo', async () => {
    const s = setup()
    s.controller.request('rewrite')
    await s.controller.settle()
    s.shown()
    s.native.fieldCurrent = false
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(writes(s.native)).toEqual([])
    expect(s.controller.state.phase).toBe('error')
    s.controller.dispose()
    const u = setup()
    u.controller.request('rewrite')
    await u.controller.settle()
    u.shown()
    await u.controller.confirm({ kind: 'held-mouth-gesture' })
    u.native.fieldCurrent = false
    await u.controller.undo()
    expect(u.controller.state.phase).toBe('cancelled')
    expect(writes(u.native)).toHaveLength(1)
    u.controller.dispose()
  })
  it('separately confirms undo and restores the original selected text', async () => {
    const s = setup()
    s.controller.request('rewrite')
    await s.controller.settle()
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    await s.controller.undo()
    expect(writes(s.native)).toHaveLength(1)
    expect(s.controller.state.phase).toBe('undo-proposed')
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(s.controller.state.phase).toBe('idle')
    expect(s.native.calls.filter((c) => c.method === 'typeText').map((c) => c.args[0])).toEqual([
      written.text,
      selected
    ])
    s.controller.dispose()
  })
  it('replies with empty selection and removes only the recorded insertion on confirmed undo', async () => {
    const s = setup('')
    s.provider.set(
      JSON.stringify({
        operation: 'reply',
        instruction: 'I can attend',
        selectedText: '',
        register: 'standard_written'
      }),
      { ...written, text: 'I can attend.' }
    )
    s.controller.request('reply', 'I can attend')
    await s.controller.settle()
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    await s.controller.undo()
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(s.controller.state.phase).toBe('idle')
    expect(s.native.calls.filter((c) => c.method === 'keyCombo').map((c) => c.args)).toEqual([
      [['backspace']]
    ])
    s.controller.dispose()
  })
})
