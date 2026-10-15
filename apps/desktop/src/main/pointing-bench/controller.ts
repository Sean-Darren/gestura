import { BenchRun, markdown } from '@gestura/pointing-bench'
import { BenchControlSchema } from '@gestura/core'
import type { BenchControl, BenchState, BenchSession } from '@gestura/core'
import type { PauseController } from '../pause'
export class BenchController {
  private run: BenchRun | undefined
  private readonly unsubscribe: () => void
  private message = 'Select a mode. Start records trials and latency in memory; saving is optional.'
  private report = ''
  private open = false
  private revision = 0
  private pendingWrite: Promise<void> = Promise.resolve()
  constructor(
    private readonly options: {
      directory?: string
      pause: PauseController
      now(): number
      publish(state: BenchState): void
      save(session: BenchSession): Promise<void>
      clear(): Promise<void>
    }
  ) {
    this.unsubscribe = options.pause.subscribe((value) => {
      this.run?.pause(value, options.now())
      this.publish()
    })
  }
  get active(): boolean {
    return !!this.run?.target
  }
  get state(): BenchState {
    return {
      open: this.open,
      running: this.active,
      paused: this.options.pause.paused,
      index: this.run?.trials.length ?? 0,
      total: this.run?.targets.length ?? 0,
      config: this.run?.config ?? null,
      target: this.run?.target ?? null,
      layout: this.run?.targets ?? [],
      message: this.message,
      report: this.report
    }
  }
  show(): void {
    this.open = true
    this.publish()
  }
  private publish(): void {
    this.options.publish(this.state)
  }
  async control(value: BenchControl): Promise<void> {
    const command = BenchControlSchema.parse(value),
      now = this.options.now()
    if (command.operation === 'open') {
      this.show()
      return
    }
    if (command.operation === 'close') {
      if (!this.active) {
        this.open = false
        this.publish()
      }
      return
    }
    if (command.operation === 'start') {
      if (this.active || this.options.pause.paused) return
      this.revision++
      this.run = new BenchRun(command.config, now)
      this.open = true
      this.report = ''
      this.message = 'Select only the highlighted target. Pause excludes time from each trial.'
      this.publish()
    } else if (command.operation === 'click') {
      if (!this.active) return
      this.run!.click(command.x, command.y, command.button, now)
      if (!this.active) await this.finish('complete')
      else this.publish()
    } else if (command.operation === 'cancel') {
      if (this.active) await this.finish('cancelled')
    } else {
      this.revision++
      this.run = undefined
      this.report = ''
      this.message = 'Deleting local benchmark files…'
      this.publish()
      try {
        const clearing = this.options.clear()
        this.pendingWrite = clearing.catch(() => {})
        await clearing
        this.message = 'Local benchmark files and in-memory results deleted'
      } catch {
        this.message = 'Could not delete local benchmark files; retry Delete'
      }
      this.publish()
    }
  }
  sample(time: number, latency: number): void {
    this.run?.latency(time, latency)
  }
  tick(): void {
    if (!this.active) return
    const count = this.run!.trials.length
    this.run!.tick(this.options.now())
    if (this.run!.trials.length !== count) {
      if (!this.active) void this.finish('complete')
      else this.publish()
    }
  }
  private async finish(status: BenchSession['status']): Promise<void> {
    const revision = this.revision
    const run = this.run
    if (!run) return
    const session = run.session(this.options.now(), status)
    this.report = markdown(session)
    // A cancelled partial trial has no selection and is excluded from the report.
    this.run = undefined
    this.message = session.config.persist
      ? 'Writing local JSON and Markdown reports…'
      : 'Finished in memory. Saving was disabled; no files written.'
    this.publish()
    if (session.config.persist) {
      try {
        const saving = this.options.save(session)
        this.pendingWrite = saving.catch(() => {})
        await saving
        if (revision !== this.revision) return
        this.message = `Saved session.json, summary.json and summary.md in ${this.options.directory ?? 'userData/pointing-bench'} (replaces previous run)`
      } catch {
        if (revision !== this.revision) return
        this.message = 'Could not save reports; the in-memory table remains available'
      }
      this.publish()
    }
  }
  async settle(): Promise<void> {
    if (this.active) await this.control({ operation: 'cancel' })
    await this.pendingWrite
  }
  dispose(): void {
    this.revision++
    this.unsubscribe()
    this.run = undefined
  }
}
