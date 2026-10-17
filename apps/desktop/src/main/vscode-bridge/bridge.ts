import { z } from 'zod'
import { CodeResponseSchema, CodeSnapshotSchema } from '@gestura/core'
import type { CodeResponse, CodeSnapshot } from '@gestura/core'
import { isConfirmedAction } from '../action-gate'
import type { ConfirmedAction } from '../action-gate'
import type { PauseController } from '../pause'
import type { CodeServer } from './server'
export const PreparedCodeSchema = z
  .object({
    snapshot: CodeSnapshotSchema,
    response: CodeResponseSchema,
    preview: z.string().uuid(),
    revision: z.number().int().nonnegative()
  })
  .strict()
export type PreparedCode = z.infer<typeof PreparedCodeSchema>
export class CodeBridge {
  private readonly used = new WeakSet<ConfirmedAction>()
  private readonly unsubscribe: () => void
  constructor(
    private readonly server: CodeServer,
    private readonly pause: PauseController
  ) {
    this.unsubscribe = pause.subscribe((paused) => server.send({ type: 'pause', paused }))
    server.send({ type: 'pause', paused: pause.paused })
  }
  async getContext(): Promise<CodeSnapshot | undefined> {
    if (this.pause.paused) return undefined
    const event = await this.server.request({ type: 'context' })
    return event?.type === 'context' && event.snapshot ? event.snapshot : undefined
  }
  async prepare(
    snapshot: CodeSnapshot,
    response: CodeResponse,
    undo = false
  ): Promise<PreparedCode | undefined> {
    if (this.pause.paused) return undefined
    const revision = this.server.revision
    const event = await this.server.request(
      undo
        ? { type: 'undoPreview', snapshot: snapshot.token }
        : { type: 'preview', snapshot: snapshot.token, response }
    )
    if (
      this.pause.paused ||
      revision !== this.server.revision ||
      event?.type !== 'result' ||
      !event.ok
    )
      return undefined
    return { snapshot, response, preview: event.id, revision }
  }
  async write(action: ConfirmedAction, undo = false): Promise<boolean> {
    if (
      !isConfirmedAction(action) ||
      this.used.has(action) ||
      this.pause.paused ||
      action.action.kind !== (undo ? 'code-restore' : 'code')
    )
      return false
    const parsed = PreparedCodeSchema.safeParse(action.action.content)
    if (!parsed.success || parsed.data.revision !== this.server.revision) return false
    this.used.add(action)
    const { snapshot, preview } = parsed.data
    const event = await this.server.request({
      type: undo ? 'undo' : 'apply',
      snapshot: snapshot.token,
      preview
    })
    return event?.type === 'result' && event.ok
  }
  cancel(): void {
    this.server.send({ type: 'cancel' })
  }
  dispose(): void {
    this.unsubscribe()
    this.cancel()
  }
}
