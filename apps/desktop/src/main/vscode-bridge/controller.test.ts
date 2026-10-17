import { describe, expect, it, vi } from 'vitest'
import { CodeController } from './controller'
import { ActionGate } from '../action-gate'
import { PauseController } from '../pause'
import type { CodeBridge } from './bridge'
import type { ConfirmationEvidence, CodeResponse, CodeSnapshot } from '@gestura/core'
const response: CodeResponse = {
  status: 'ok',
  code: 'const a = 1',
  insertMode: 'insert_at_cursor',
  explanation: { en: 'Adds a constant', zh_hk: '新增常數' }
}
function setup(): {
  controller: CodeController
  gate: ActionGate
  pause: PauseController
  write: ReturnType<typeof vi.fn>
  generate: ReturnType<typeof vi.fn>
  shown(): void
  time(value: number): void
} {
  let now = 1000
  const gate = new ActionGate(
      () => now,
      () => now
    ),
    pause = new PauseController()
  const snapshot: CodeSnapshot = {
    token: crypto.randomUUID(),
    context: { languageId: 'typescript', fileName: 'a.ts', selection: '', surroundingLines: [] }
  }
  const write = vi.fn(async () => true),
    generate = vi.fn(async () => response)
  const controller = new CodeController({
    gate,
    pause,
    now: () => now,
    foreground: async () => ({ appId: 'com.microsoft.VSCode', windowTitle: 'test' }),
    display: () => ({ width: 1280, height: 800 }),
    generate,
    publish: vi.fn(),
    bridge: {
      getContext: async () => snapshot,
      prepare: async (_s: CodeSnapshot, r: CodeResponse) => ({
        snapshot,
        response: r,
        preview: crypto.randomUUID(),
        revision: 1
      }),
      write,
      cancel: vi.fn()
    } as unknown as CodeBridge
  })
  return {
    controller,
    gate,
    pause,
    write,
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
describe('code proposal confirmation loop', () => {
  it('requires review and fresh allowed evidence, and writes once per confirmation', async () => {
    const s = setup()
    s.controller.start('add a constant')
    await s.controller.settle()
    await s.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 1001 })
    expect(s.write).not.toHaveBeenCalled()
    s.shown()
    for (const kind of ['blink', 'wink', 'dwell'])
      await s.controller.confirm({ kind } as unknown as ConfirmationEvidence)
    await s.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 999 })
    expect(s.write).not.toHaveBeenCalled()
    s.time(1010)
    await Promise.all([
      s.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 1005 }),
      s.controller.confirm({ kind: 'held-mouth-gesture' })
    ])
    expect(s.write).toHaveBeenCalledOnce()
  })
  it('expires stale proposals', async () => {
    const s = setup()
    s.controller.start('add a constant')
    await s.controller.settle()
    s.shown()
    s.time(61000)
    s.controller.tick()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(s.write).not.toHaveBeenCalled()
    expect(s.controller.state.phase).toBe('cancelled')
  })
  it('correction invalidates the old action and includes previous request/code', async () => {
    const s = setup()
    s.controller.start('add a constant')
    await s.controller.settle()
    s.shown()
    const old = s.controller.state.proposalId!
    s.controller.start('use b instead', 'en', true)
    await s.controller.settle()
    expect(s.gate.confirm(old, { kind: 'held-mouth-gesture' })).toBeNull()
    expect(s.controller.state.correction).toBe(1)
    expect(JSON.stringify(s.generate.mock.calls.at(-1))).toContain('const a = 1')
    expect(JSON.stringify(s.generate.mock.calls.at(-1))).toContain('add a constant')
    expect(s.write).not.toHaveBeenCalled()
  })
  it('pause cancels a visible proposal and stops writes', async () => {
    const s = setup()
    s.controller.start('add a constant')
    await s.controller.settle()
    s.shown()
    s.pause.toggle()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(s.write).not.toHaveBeenCalled()
    expect(s.controller.state.phase).toBe('cancelled')
  })
  it('undo stages a new reviewed confirmation, including an empty inverse insertion', async () => {
    const s = setup()
    s.controller.start('add a constant')
    await s.controller.settle()
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    await s.controller.undo()
    expect(s.write).toHaveBeenCalledOnce()
    expect(s.controller.state.phase).toBe('undo-proposed')
    s.shown()
    await s.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(s.write).toHaveBeenCalledTimes(2)
    expect(s.write.mock.calls[1]?.[1]).toBe(true)
  })
})
