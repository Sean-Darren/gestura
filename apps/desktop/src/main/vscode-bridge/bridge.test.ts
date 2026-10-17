import { expect, it, vi } from 'vitest'
import { CodeBridge } from './bridge'
import { ActionGate } from '../action-gate'
import { PauseController } from '../pause'
import type { CodeServer } from './server'
import type { ConfirmedAction } from '../action-gate'
import type { CodeEvent, CodeResponse, CodeSnapshot } from '@gestura/core'

it('accepts only a minted single-use action bound to the connection revision', async () => {
  const snapshot: CodeSnapshot = {
    token: crypto.randomUUID(),
    context: { languageId: 'ts', fileName: 'a.ts', selection: '', surroundingLines: [] }
  }
  const response: CodeResponse = {
    status: 'ok',
    code: 'x',
    insertMode: 'insert_at_cursor',
    explanation: { en: 'x', zh_hk: '字' }
  }
  const request = vi.fn(async (): Promise<CodeEvent> => ({
    type: 'result',
    id: crypto.randomUUID(),
    ok: true
  }))
  const server = {
    revision: 1,
    connected: true,
    port: 3550,
    send: vi.fn(),
    request,
    close: vi.fn()
  } as unknown as CodeServer
  const pause = new PauseController(),
    bridge = new CodeBridge(server, pause),
    gate = new ActionGate()
  const prepared = await bridge.prepare(snapshot, response)
  expect(prepared).toBeDefined()
  request.mockClear()
  expect(
    await bridge.write({
      action: { kind: 'code', content: prepared }
    } as unknown as ConfirmedAction)
  ).toBe(false)
  const id = gate.propose({ kind: 'code', content: prepared! })
  const confirmed = gate.confirm(id, { kind: 'held-mouth-gesture' })!
  expect(await bridge.write(confirmed)).toBe(true)
  expect(await bridge.write(confirmed)).toBe(false)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0]).toEqual([
    { type: 'apply', snapshot: snapshot.token, preview: prepared!.preview }
  ])
  const another = gate.confirm(gate.propose({ kind: 'code', content: prepared! }), {
    kind: 'held-mouth-gesture'
  })!
  Object.assign(server, { revision: 2 })
  expect(await bridge.write(another)).toBe(false)
  pause.toggle()
  expect(server.send).toHaveBeenLastCalledWith({ type: 'pause', paused: true })
  expect(await bridge.getContext()).toBeUndefined()
  bridge.dispose()
})
