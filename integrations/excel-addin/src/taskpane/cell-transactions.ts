import { ExcelSnapshotSchema } from '@gestura/core'
import type { ExcelSnapshot } from '@gestura/core'
type Content = ExcelSnapshot['before']
export interface CellBackend {
  read(sheetId: string, target: string): Promise<Content>
  replace(sheetId: string, target: string, expected: Content, replacement: Content): Promise<void>
}
/** Connection-local snapshots and single-use writes; original values never enter provider context. */
export class CellTransactions {
  private readonly records = new Map<
    string,
    { snapshot: ExcelSnapshot; created: number; formula?: string; restored: boolean }
  >()
  constructor(
    private readonly backend: CellBackend,
    readonly sessionId: string,
    private readonly now = () => Date.now()
  ) {}
  async prepare(sheetId: string, target: string): Promise<ExcelSnapshot> {
    for (const [id, r] of this.records) if (this.now() - r.created >= 60000) this.records.delete(id)
    if (this.records.size >= 100) throw Error('Too many cell proposals')
    const before = await this.backend.read(sheetId, target)
    const snapshot = ExcelSnapshotSchema.parse({
      token: crypto.randomUUID(),
      sessionId: this.sessionId,
      sheetId,
      target,
      before
    })
    this.records.set(snapshot.token, {
      snapshot: ExcelSnapshotSchema.parse(snapshot),
      created: this.now(),
      restored: false
    })
    return snapshot
  }
  private record(snapshot: ExcelSnapshot): {
    snapshot: ExcelSnapshot
    created: number
    formula?: string
    restored: boolean
  } {
    const r = this.records.get(snapshot.token)
    if (
      !r ||
      snapshot.sessionId !== this.sessionId ||
      JSON.stringify(r.snapshot) !== JSON.stringify(snapshot) ||
      this.now() - r.created >= 60000
    )
      throw Error('Cell proposal expired or belongs to another Excel session')
    return r
  }
  async commit(snapshot: ExcelSnapshot, formula: string): Promise<void> {
    const r = this.record(snapshot)
    if (r.formula !== undefined) throw Error('Cell proposal already used')
    r.formula = formula // Reserve before awaiting: failures are never retried as a second mutation.
    await this.backend.replace(snapshot.sheetId, snapshot.target, r.snapshot.before, {
      formula,
      value: null
    })
    r.created = this.now()
  }
  async restore(snapshot: ExcelSnapshot, expectedFormula: string): Promise<void> {
    const r = this.record(snapshot)
    if (r.formula !== expectedFormula || r.restored) throw Error('No matching undo record')
    r.restored = true
    await this.backend.replace(
      snapshot.sheetId,
      snapshot.target,
      { formula: expectedFormula, value: null },
      r.snapshot.before
    )
  }
  clear(): void {
    this.records.clear()
  }
}
