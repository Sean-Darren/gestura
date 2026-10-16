import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXCEL_WS_PATH } from '@gestura/core'
import type { ExcelContext } from '@gestura/core'
import { BridgeClient } from './bridge-client'
import type { ExcelOfficeApi } from './bridge-client'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }

  emitClose(): void {
    this.onclose?.()
  }
}

function fakeCtor(): typeof WebSocket {
  return FakeWebSocket as unknown as typeof WebSocket
}

const context: ExcelContext = {
  sheetName: 'Sheet1',
  selectionAddress: 'B2:C5',
  activeCell: 'B2',
  headers: ['Name', 'Qty'],
  columnTypes: { A: 'string', B: 'number' },
  usedRangeAddress: 'A1:B12'
}

const id = 'c0ffee00-0000-4000-8000-000000000000'

beforeEach(() => {
  FakeWebSocket.instances = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BridgeClient', () => {
  it('opens a token-paired WebSocket to the loopback origin', () => {
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office: {} as ExcelOfficeApi,
      WebSocketCtor: fakeCtor()
    })
    client.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0]!.url).toBe(
      `wss://localhost:3510${EXCEL_WS_PATH}?token=secret`
    )
    client.disconnect()
  })

  it('dispatches getContext and replies with a context event', async () => {
    const office = {
      getContext: vi.fn(async () => context),
      writeFormula: vi.fn(async () => undefined),
      selectRange: vi.fn(async () => undefined)
    }
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office,
      WebSocketCtor: fakeCtor()
    })
    client.connect()
    FakeWebSocket.instances[0]!.emitMessage({ type: 'getContext', id, includeSamples: false })
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]!.sent.length).toBe(1))
    expect(office.getContext).toHaveBeenCalledWith(false)
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent[0]!)).toMatchObject({ type: 'context', id })
    client.disconnect()
  })

  it('dispatches writeFormula and acks done', async () => {
    const office = {
      getContext: vi.fn(),
      writeFormula: vi.fn(async () => undefined),
      selectRange: vi.fn()
    }
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office,
      WebSocketCtor: fakeCtor()
    })
    client.connect()
    FakeWebSocket.instances[0]!.emitMessage({
      type: 'writeFormula',
      id,
      formula: '=SUM(A1:A3)',
      target: 'C1'
    })
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]!.sent.length).toBe(1))
    expect(office.writeFormula).toHaveBeenCalledWith('=SUM(A1:A3)', 'C1')
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent[0]!)).toEqual({ type: 'done', id })
    client.disconnect()
  })

  it('dispatches selectRange and acks done without writing', async () => {
    const office = {
      getContext: vi.fn(),
      writeFormula: vi.fn(),
      selectRange: vi.fn(async () => undefined)
    }
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office,
      WebSocketCtor: fakeCtor()
    })
    client.connect()
    FakeWebSocket.instances[0]!.emitMessage({ type: 'selectRange', id, address: 'A1:A10' })
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]!.sent.length).toBe(1))
    expect(office.selectRange).toHaveBeenCalledWith('A1:A10')
    expect(office.writeFormula).not.toHaveBeenCalled()
    client.disconnect()
  })

  it('ignores a command that fails validation', async () => {
    const office = {
      getContext: vi.fn(),
      writeFormula: vi.fn(),
      selectRange: vi.fn()
    }
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office,
      WebSocketCtor: fakeCtor()
    })
    client.connect()
    FakeWebSocket.instances[0]!.emitMessage({ type: 'deleteEverything' })
    await vi.waitFor(() => expect(office.getContext).not.toHaveBeenCalled())
    expect(FakeWebSocket.instances[0]!.sent).toHaveLength(0)
    client.disconnect()
  })

  it('reconnects with backoff after a close and stops on disconnect', () => {
    vi.useFakeTimers()
    const client = new BridgeClient({
      token: 'secret',
      origin: 'https://localhost:3510',
      office: {} as ExcelOfficeApi,
      WebSocketCtor: fakeCtor(),
      delaysMs: [1000, 2000]
    })
    client.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
    FakeWebSocket.instances[0]!.emitClose()
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.instances[1]!.emitClose()
    vi.advanceTimersByTime(2000)
    expect(FakeWebSocket.instances).toHaveLength(3)
    client.disconnect()
    FakeWebSocket.instances[2]!.emitClose()
    vi.advanceTimersByTime(4000)
    expect(FakeWebSocket.instances).toHaveLength(3)
  })
})
