import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { EXCEL_WS_PATH } from '@gestura/core'
import type { ExcelCommand } from '@gestura/core'
import { ActionGate } from '../action-gate'
import { startExcelServer } from './server'
import type { ExcelServer } from './server'
import { ExcelBridge } from './bridge'

const servers: ExcelServer[] = []
const clients: WebSocket[] = []

async function start(): Promise<ExcelServer> {
  const server = await startExcelServer({ token: 'a'.repeat(64) })
  servers.push(server)
  return server
}

const context = {
  sheetName: 'Sheet1',
  selectionAddress: 'B2:C5',
  activeCell: 'B2',
  headers: ['Name', 'Qty'],
  columnTypes: { A: 'string', B: 'number' },
  usedRangeAddress: 'A1:B12'
}

/** Connects a client that records inbound commands and auto-acks them. */
async function connectClient(server: ExcelServer): Promise<ExcelCommand[]> {
  const received: ExcelCommand[] = []
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${server.token}`)
  clients.push(ws)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  ws.on('message', (data) => {
    const command = JSON.parse(data.toString()) as ExcelCommand
    received.push(command)
    if (command.type === 'getContext') {
      ws.send(JSON.stringify({ type: 'context', id: command.id, context }))
    } else if (command.type === 'writeFormula' || command.type === 'selectRange') {
      ws.send(JSON.stringify({ type: 'done', id: command.id }))
    }
  })
  return received
}

function mintFormula(gate: ActionGate): NonNullable<ReturnType<ActionGate['confirm']>> {
  const id = gate.propose({ kind: 'formula', content: { formula: '=SUM(A1:A3)', target: 'C1' } })
  gate.markShown(id)
  const confirmed = gate.confirm(id, { kind: 'held-mouth-gesture' })
  if (!confirmed) throw new Error('expected a confirmed action')
  return confirmed
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate()
  await Promise.all(servers.splice(0).map((s) => s.close()))
})

describe('ExcelBridge', () => {
  it('rejects writeFormula for a non-confirmed object', async () => {
    const server = await start()
    await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    await expect(bridge.writeFormula({ formula: '=1', target: 'C1' } as never)).resolves.toBe(false)
    bridge.dispose()
  })

  it('writes a confirmed formula and reports success', async () => {
    const server = await start()
    const received = await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    const gate = new ActionGate()
    const result = await bridge.writeFormula(mintFormula(gate))
    expect(result).toBe(true)
    expect(received).toContainEqual(
      expect.objectContaining({ type: 'writeFormula', formula: '=SUM(A1:A3)', target: 'C1' })
    )
    bridge.dispose()
  })

  it('rejects reusing the same confirmation', async () => {
    const server = await start()
    await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    const gate = new ActionGate()
    const confirmation = mintFormula(gate)
    await expect(bridge.writeFormula(confirmation)).resolves.toBe(true)
    await expect(bridge.writeFormula(confirmation)).resolves.toBe(false)
    bridge.dispose()
  })

  it('returns workbook context from getContext', async () => {
    const server = await start()
    await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    await expect(bridge.getContext()).resolves.toEqual(context)
    bridge.dispose()
  })

  it('sends selectRange and never a write', async () => {
    const server = await start()
    const received = await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    expect(bridge.selectRange('A1:A10')).toBe(true)
    await vi.waitFor(() =>
      expect(received).toContainEqual(
        expect.objectContaining({ type: 'selectRange', address: 'A1:A10' })
      )
    )
    expect(received.some((c) => c.type === 'writeFormula')).toBe(false)
    bridge.dispose()
  })

  it('rejects an invalid selectRange address', async () => {
    const server = await start()
    await connectClient(server)
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    expect(bridge.selectRange('not-a-range')).toBe(false)
    bridge.dispose()
  })

  it('returns undefined when no add-in is connected', async () => {
    const server = await start()
    const bridge = new ExcelBridge({ server, shareSampleValues: false })
    await expect(bridge.getContext()).resolves.toBeUndefined()
    expect(bridge.selectRange('A1:A10')).toBe(false)
    bridge.dispose()
  })
})
