import { ExcelCommandSchema, EXCEL_WS_PATH } from '@gestura/core'
import type { ExcelCommand, ExcelContext, ExcelEvent, ExcelSnapshot } from '@gestura/core'

export interface ExcelOfficeApi {
  getContext(includeSamples: boolean): Promise<ExcelContext>
  writeFormula(formula: string, target: string): Promise<void>
  selectRange(address: string, sheetId?: string): Promise<void>
  prepareCell?(sheetId: string, target: string): Promise<ExcelSnapshot>
  commitFormula?(snapshot: ExcelSnapshot, formula: string): Promise<void>
  restoreCell?(snapshot: ExcelSnapshot, expectedFormula: string): Promise<void>
  resetSession?(): void
  readonly sessionId?: string
}

export interface BridgeClientOptions {
  token: string
  /** Loopback origin that served the taskpane, e.g. https://localhost:3510. */
  origin: string
  office: ExcelOfficeApi
  WebSocketCtor?: typeof WebSocket
  delaysMs?: readonly number[]
}

const DEFAULT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const

/**
 * The add-in side of the bridge: connects to main's token-paired WebSocket,
 * validates inbound commands with the shared core schemas, and auto-reconnects
 * when the socket drops (for example, after Excel restarts and reloads the page).
 */
export class BridgeClient {
  private socket: WebSocket | undefined
  private retry = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private readonly mutations = new Map<string, Promise<ExcelEvent>>()

  constructor(private readonly options: BridgeClientOptions) {}

  connect(): void {
    this.stopped = false
    this.open()
  }

  private resolveWebSocket(): typeof WebSocket {
    return this.options.WebSocketCtor ?? globalThis.WebSocket
  }

  private url(): string {
    const origin = this.options.origin.replace(/\/$/, '')
    const wsOrigin = origin.replace(/^http/, 'ws')
    return `${wsOrigin}${EXCEL_WS_PATH}?token=${encodeURIComponent(this.options.token)}`
  }

  private open(): void {
    this.options.office.resetSession?.()
    this.mutations.clear()
    const Ctor = this.resolveWebSocket()
    const socket = new Ctor(this.url())
    this.socket = socket
    socket.onopen = () => {
      this.retry = 0
    }
    socket.onmessage = (event) => {
      if (this.socket === socket) this.handleMessage(event)
    }
    socket.onclose = () => {
      if (this.socket === socket) this.scheduleReconnect()
    }
    socket.onerror = () => {
      // onclose follows and drives the reconnect decision.
    }
  }

  private handleMessage(event: { data: unknown }): void {
    let candidate: unknown
    try {
      candidate = JSON.parse(String(event.data))
    } catch {
      return
    }
    const parsed = ExcelCommandSchema.safeParse(candidate)
    if (!parsed.success) return
    void this.dispatch(parsed.data)
  }

  private async dispatch(command: ExcelCommand): Promise<void> {
    const socket = this.socket
    const mutating = ['writeFormula', 'commitFormula', 'restoreCell'].includes(command.type)
    const previous = this.mutations.get(command.id)
    if (previous) {
      const event = await previous
      if (this.socket === socket) this.send(event)
      return
    }
    if (mutating && this.mutations.size >= 1000) {
      this.socket?.close()
      return
    }
    const operation = this.execute(command)
    if (mutating) {
      this.mutations.set(command.id, operation)
    }
    const event = await operation
    if (this.socket === socket) this.send(event)
  }
  private async execute(command: ExcelCommand): Promise<ExcelEvent> {
    try {
      let event: ExcelEvent
      if (command.type === 'getContext') {
        const context = await this.options.office.getContext(command.includeSamples)
        event = { type: 'context', id: command.id, context }
      } else if (command.type === 'prepareCell') {
        if (command.sessionId !== this.options.office.sessionId || !this.options.office.prepareCell)
          throw Error('Excel session changed')
        event = {
          type: 'prepared',
          id: command.id,
          snapshot: await this.options.office.prepareCell(command.sheetId, command.target)
        }
      } else if (command.type === 'commitFormula') {
        if (!this.options.office.commitFormula) throw Error('Update the Gestura add-in')
        await this.options.office.commitFormula(command.snapshot, command.formula)
        event = { type: 'done', id: command.id }
      } else if (command.type === 'restoreCell') {
        if (!this.options.office.restoreCell) throw Error('Update the Gestura add-in')
        await this.options.office.restoreCell(command.snapshot, command.expectedFormula)
        event = { type: 'done', id: command.id }
      } else if (command.type === 'writeFormula') {
        await this.options.office.writeFormula(command.formula, command.target)
        event = { type: 'done', id: command.id }
      } else {
        if (command.sessionId && command.sessionId !== this.options.office.sessionId)
          throw Error('Excel session changed')
        if (command.sheetId) await this.options.office.selectRange(command.address, command.sheetId)
        else await this.options.office.selectRange(command.address)
        event = { type: 'done', id: command.id }
      }
      return event
    } catch (error) {
      return {
        type: 'error',
        id: command.id,
        message: String(error).slice(0, 500)
      }
    }
  }

  private send(event: ExcelEvent): void {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(event))
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    const delays = this.options.delaysMs ?? DEFAULT_DELAYS
    const delay =
      delays[Math.min(this.retry, delays.length - 1)] ?? DEFAULT_DELAYS[DEFAULT_DELAYS.length - 1]!
    this.retry++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }

  disconnect(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.options.office.resetSession?.()
  }
}
