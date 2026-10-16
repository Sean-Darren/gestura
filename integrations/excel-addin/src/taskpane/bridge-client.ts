import { ExcelCommandSchema, EXCEL_WS_PATH } from '@gestura/core'
import type { ExcelCommand, ExcelContext, ExcelEvent } from '@gestura/core'

export interface ExcelOfficeApi {
  getContext(includeSamples: boolean): Promise<ExcelContext>
  writeFormula(formula: string, target: string): Promise<void>
  selectRange(address: string): Promise<void>
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
    const Ctor = this.resolveWebSocket()
    const socket = new Ctor(this.url())
    this.socket = socket
    socket.onopen = () => {
      this.retry = 0
    }
    socket.onmessage = (event) => this.handleMessage(event)
    socket.onclose = () => this.scheduleReconnect()
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
    try {
      let event: ExcelEvent
      if (command.type === 'getContext') {
        const context = await this.options.office.getContext(command.includeSamples)
        event = { type: 'context', id: command.id, context }
      } else if (command.type === 'writeFormula') {
        await this.options.office.writeFormula(command.formula, command.target)
        event = { type: 'done', id: command.id }
      } else {
        await this.options.office.selectRange(command.address)
        event = { type: 'done', id: command.id }
      }
      this.send(event)
    } catch (error) {
      this.send({
        type: 'error',
        id: command.id,
        message: String(error).slice(0, 500)
      })
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
  }
}
