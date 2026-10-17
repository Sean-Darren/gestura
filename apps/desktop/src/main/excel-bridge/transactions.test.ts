import { describe, expect, it, vi } from 'vitest'
import type { ExcelCommand, ExcelContext, ExcelEvent, ExcelSnapshot } from '@gestura/core'
import { ActionGate } from '../action-gate'
import { ExcelBridge } from './bridge'
import type { ExcelServer } from './server'
const snapshot: ExcelSnapshot = {
  token: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  sheetId: 'sheet-1',
  target: 'C2',
  before: { formula: null, value: '=literal' }
}
const context: ExcelContext = {
  sheetName: 'Sheet1',
  sheetId: snapshot.sheetId,
  sessionId: snapshot.sessionId,
  selectionAddress: 'C2',
  activeCell: 'C2',
  headers: [],
  columnTypes: {},
  usedRangeAddress: 'A1:C10'
}
function harness(): {
  server: ExcelServer & { clientCount: number; connectionRevision: number }
  bridge: ExcelBridge
  send: ReturnType<typeof vi.fn>
  event(e: ExcelEvent): void
} {
  let listener: (e: ExcelEvent) => void = () => {}
  const send = vi.fn((c: ExcelCommand) =>
    queueMicrotask(() =>
      listener(
        c.type === 'getContext'
          ? { type: 'context', id: c.id, context }
          : c.type === 'prepareCell'
            ? { type: 'prepared', id: c.id, snapshot }
            : { type: 'done', id: c.id }
      )
    )
  )
  const server = {
    token: '',
    port: 0,
    url: '',
    clientCount: 1,
    connectionRevision: 1,
    broadcast: send,
    subscribe: (cb: (e: ExcelEvent) => void) => {
      listener = cb
      return () => {}
    },
    close: async () => {}
  }
  return {
    server,
    send,
    bridge: new ExcelBridge({ server, shareSampleValues: false, now: () => 1000, timeoutMs: 50 }),
    event: (e) => listener(e)
  }
}
function confirm(
  kind: string,
  content: { [key: string]: import('../action-gate').JsonValue }
): NonNullable<ReturnType<ActionGate['confirm']>> {
  const gate = new ActionGate(() => 1000),
    id = gate.propose({ kind, content })
  return gate.confirm(id, { kind: 'held-mouth-gesture' })!
}
describe('bound Excel transactions', () => {
  it('prepares, commits and restores through separate single-use ActionGate actions', async () => {
    const h = harness()
    await expect(h.bridge.getContext()).resolves.toEqual(context)
    await expect(h.bridge.prepareFormula(context, 'C2')).resolves.toEqual(snapshot)
    const action = confirm('formula', { formula: '=1', target: 'C2', snapshot })
    await expect(h.bridge.writeFormula(action)).resolves.toBe(true)
    await expect(h.bridge.writeFormula(action)).resolves.toBe(false)
    const undo = confirm('excel-restore', { snapshot, expectedFormula: '=1' })
    await expect(h.bridge.restoreCell(undo)).resolves.toBe(true)
    await expect(h.bridge.restoreCell(undo)).resolves.toBe(false)
    expect(h.send.mock.calls.map(([c]) => c.type)).toEqual([
      'getContext',
      'prepareCell',
      'commitFormula',
      'restoreCell'
    ])
    h.bridge.dispose()
  })
  it('fails closed with multiple add-ins and discards replies across reconnects', async () => {
    const h = harness()
    h.server.clientCount = 2
    await expect(
      h.bridge.writeFormula(confirm('formula', { formula: '=1', target: 'C2', snapshot }))
    ).resolves.toBe(false)
    expect(h.send).not.toHaveBeenCalled()
    h.server.clientCount = 1
    const request = h.bridge.getContext()
    h.server.connectionRevision++
    await expect(request).resolves.toBeUndefined()
    h.bridge.dispose()
  })
  it('rejects forged restores and mismatched prepare targets', async () => {
    const h = harness()
    await expect(h.bridge.restoreCell({} as never)).resolves.toBe(false)
    await expect(h.bridge.prepareFormula(context, 'D2')).resolves.toBeUndefined()
    h.bridge.dispose()
  })
})
