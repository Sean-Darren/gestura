import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { ConfirmationEvidenceSchema } from '@gestura/core'
export type { ConfirmationEvidence } from '@gestura/core'

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ProposedAction = {
  kind: string
  content: JsonValue
}

const confirmedActionBrand: unique symbol = Symbol('ConfirmedAction')
const mintedActions = new WeakSet<object>()

export type ConfirmedAction = {
  readonly [confirmedActionBrand]: true
  readonly id: string
  readonly action: ProposedAction
  readonly confirmedAt: number
}

type StoredProposal = {
  action: ProposedAction
  hash: string
  createdAt: number
  shownAt?: number
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Action content must contain finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys
      .map((key) => {
        const child = value[key]
        if (child === undefined) throw new TypeError('Action content must be JSON-compatible')
        return `${JSON.stringify(key)}:${canonicalize(child)}`
      })
      .join(',')}}`
  }
  throw new TypeError('Action content must be JSON-compatible')
}

function contentHash(action: ProposedAction): string {
  return createHash('sha256').update(canonicalize(action)).digest('hex')
}

function copyAction(action: ProposedAction): ProposedAction {
  return JSON.parse(JSON.stringify(action)) as ProposedAction
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

export class ActionGate {
  private readonly proposals = new Map<string, StoredProposal>()

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly epochNow: () => number = () => performance.timeOrigin + performance.now()
  ) {}

  propose(action: ProposedAction): string {
    const createdAt = this.now()
    for (const [id, proposal] of this.proposals) {
      if (createdAt - proposal.createdAt >= 60_000) this.proposals.delete(id)
    }
    const id = randomUUID()
    this.proposals.set(id, { action, hash: contentHash(action), createdAt })
    return id
  }

  /** Trusted presentation code calls this after the proposal becomes visible. */
  cancel(id: string): void {
    this.proposals.delete(id)
  }

  markShown(id: string): boolean {
    const proposal = this.proposals.get(id)
    const age = proposal ? this.now() - proposal.createdAt : -1
    const shownAt = this.epochNow()
    if (!proposal || age < 0 || age >= 60_000 || !Number.isFinite(shownAt) || shownAt < 0)
      return false
    proposal.shownAt = shownAt
    return true
  }

  confirm(id: string, evidence: unknown): ConfirmedAction | null {
    const proposal = this.proposals.get(id)
    if (!proposal) return null

    const confirmedAt = this.now()
    const age = confirmedAt - proposal.createdAt
    if (age < 0 || age >= 60_000) {
      this.proposals.delete(id)
      return null
    }
    const parsedEvidence = ConfirmationEvidenceSchema.safeParse(evidence)
    if (!parsedEvidence.success) return null
    if (parsedEvidence.data.kind === 'voice-confirm') {
      const started = parsedEvidence.data.tSpeechStart
      const epochNow = this.epochNow()
      if (
        proposal.shownAt === undefined ||
        started <= proposal.shownAt ||
        !Number.isFinite(epochNow) ||
        started > epochNow
      )
        return null
    }

    let currentHash: string
    try {
      currentHash = contentHash(proposal.action)
    } catch {
      this.proposals.delete(id)
      return null
    }
    if (currentHash !== proposal.hash) {
      this.proposals.delete(id)
      return null
    }

    this.proposals.delete(id)
    const action = deepFreeze(copyAction(proposal.action))
    const confirmed = Object.freeze({
      [confirmedActionBrand]: true as const,
      id,
      action,
      confirmedAt
    })
    mintedActions.add(confirmed)
    return confirmed
  }
}

export function isConfirmedAction(value: unknown): value is ConfirmedAction {
  return typeof value === 'object' && value !== null && mintedActions.has(value)
}
