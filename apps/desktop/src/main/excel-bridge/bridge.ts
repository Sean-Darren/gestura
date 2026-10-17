import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import {
  ExcelSelectionSchema,
  ExcelContextSchema,
  FormulaActionSchema,
  RestoreCellActionSchema
} from '@gestura/core'
import type { ExcelContext, ExcelCommand, ExcelEvent, ExcelSnapshot } from '@gestura/core'
import { isConfirmedAction } from '../action-gate'
import type { ConfirmedAction } from '../action-gate'
import type { ExcelServer } from './server'

const ConfirmedFormulaArgsSchema = z.tuple([
  z.custom<ConfirmedAction>(isConfirmedAction, 'ActionGate confirmation required')
])

type Pending = {
  resolve: (value: ExcelContext | ExcelSnapshot | boolean | undefined) => void
  timer: ReturnType<typeof setTimeout>
  revision: number
}

export interface ExcelBridgeOptions {
  server: ExcelServer
  shareSampleValues: boolean
  timeoutMs?: number
  now?: () => number
}

/**
 * The main-process side of the Excel bridge. It is the only code that holds a
 * `ConfirmedAction`; the add-in never authors a write. `writeFormula` rejects
 * anything that is not a fresh, unused ActionGate confirmation for a formula.
 */
export class ExcelBridge {
  private readonly pending = new Map<string, Pending>()
  private readonly used = new WeakSet<ConfirmedAction>()
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly unsubscribe: () => void

  constructor(private readonly options: ExcelBridgeOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.now = options.now ?? (() => performance.now())
    this.unsubscribe = options.server.subscribe((event) => this.onEvent(event))
  }

  private onEvent(event: ExcelEvent): void {
    if (event.type === 'ready') return
    if (event.type === 'prepared') {
      this.settle(event.id, event.snapshot)
      return
    }
    if (event.type === 'error') {
      if (event.id === undefined) return
      this.settle(event.id, false)
      return
    }
    if (event.type === 'done') {
      this.settle(event.id, true)
      return
    }
    // context
    const parsed = ExcelContextSchema.safeParse(event.context)
    this.settle(event.id, parsed.success ? parsed.data : undefined)
  }

  private settle(id: string, value: ExcelContext | ExcelSnapshot | boolean | undefined): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.resolve(
      this.options.server.clientCount === 1 &&
        pending.revision === this.options.server.connectionRevision
        ? value
        : undefined
    )
  }

  private async sendAndWait(
    command: ExcelCommand,
    id: string
  ): Promise<ExcelContext | ExcelSnapshot | boolean | undefined> {
    if (this.options.server.clientCount !== 1) return undefined
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(undefined)
      }, this.timeoutMs)
      this.pending.set(id, { resolve, timer, revision: this.options.server.connectionRevision })
      this.options.server.broadcast(command)
    })
  }

  /** Request the active workbook context; sample values only when the toggle is on (Q15). */
  async getContext(): Promise<ExcelContext | undefined> {
    const id = randomUUID()
    const result = await this.sendAndWait(
      { type: 'getContext', id, includeSamples: this.options.shareSampleValues },
      id
    )
    return typeof result === 'object' && 'activeCell' in result ? result : undefined
  }
  async prepareFormula(context: ExcelContext, target: string): Promise<ExcelSnapshot | undefined> {
    if (!context.sessionId || !context.sheetId) return undefined
    const id = randomUUID()
    const result = await this.sendAndWait(
      { type: 'prepareCell', id, target, sheetId: context.sheetId, sessionId: context.sessionId },
      id
    )
    return typeof result === 'object' &&
      'token' in result &&
      result.sessionId === context.sessionId &&
      result.sheetId === context.sheetId &&
      result.target === target
      ? result
      : undefined
  }
  async restoreCell(confirmation: ConfirmedAction): Promise<boolean> {
    if (!isConfirmedAction(confirmation) || this.used.has(confirmation)) return false
    const parsed = RestoreCellActionSchema.safeParse(confirmation.action)
    const age = this.now() - confirmation.confirmedAt
    if (!parsed.success || age < 0 || age >= 60000) return false
    this.used.add(confirmation)
    const id = randomUUID()
    return (
      (await this.sendAndWait({ type: 'restoreCell', id, ...parsed.data.content }, id)) === true
    )
  }

  /** Write a confirmed formula to its target cell. Rejects non-confirmed input. */
  async writeFormula(confirmation: ConfirmedAction): Promise<boolean> {
    const args = ConfirmedFormulaArgsSchema.safeParse([confirmation])
    if (!args.success) return false
    const action = FormulaActionSchema.safeParse(confirmation.action)
    if (!action.success) return false
    const age = this.now() - confirmation.confirmedAt
    if (age < 0 || age >= 60_000 || this.used.has(confirmation)) return false
    this.used.add(confirmation)
    const id = randomUUID()
    const result = await this.sendAndWait(
      action.data.content.snapshot
        ? {
            type: 'commitFormula',
            id,
            formula: action.data.content.formula,
            snapshot: action.data.content.snapshot
          }
        : {
            type: 'writeFormula',
            id,
            formula: action.data.content.formula,
            target: action.data.content.target
          },
      id
    )
    return result === true
  }

  /** Highlight referenced columns by changing the selection. Never writes. */
  selectRange(address: string, binding?: Pick<ExcelContext, 'sessionId' | 'sheetId'>): boolean {
    const parsed = ExcelSelectionSchema.safeParse(address)
    if (!parsed.success || this.options.server.clientCount !== 1) return false
    this.options.server.broadcast({
      type: 'selectRange',
      id: randomUUID(),
      address: parsed.data,
      ...(binding?.sessionId ? { sessionId: binding.sessionId } : {}),
      ...(binding?.sheetId ? { sheetId: binding.sheetId } : {})
    })
    return true
  }

  dispose(): void {
    this.unsubscribe()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve(undefined)
    }
    this.pending.clear()
  }
  async highlight(
    address: string,
    binding: Pick<ExcelContext, 'sessionId' | 'sheetId'>
  ): Promise<boolean> {
    const parsed = ExcelSelectionSchema.safeParse(address)
    if (!parsed.success || !binding.sessionId || !binding.sheetId) return false
    const id = randomUUID()
    return (
      (await this.sendAndWait(
        {
          type: 'selectRange',
          id,
          address: parsed.data,
          sessionId: binding.sessionId,
          sheetId: binding.sheetId
        },
        id
      )) === true
    )
  }
}
